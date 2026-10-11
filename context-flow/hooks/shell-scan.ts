// Limits of the scanner, each one true of the code:
// - A variable binds only from a plain NAME=<literal> that is the whole of an assignment-only command; export, declare, local and readonly do not bind.
// - Bindings leak out of subshells and function bodies, since the scanner models neither scope.
// - Only $NAME and ${NAME} expand, and only when bound; every other expansion stays raw and dynamic.
// - Assignment-value substitutions are data unless the caller asks for 'commands'.
// - Heredocs are recognised outside substitutions only; a function body is scanned, but its calls are not tracked.
// - $'...' escapes are not decoded.
// - No aliases, glob or brace expansion.
// - Command-start keywords are only {, do, then and else.
// - Nesting caps: 32 levels of double-quote and $(...) recursion, and 8 levels of descent into bash -c, sh -c, eval and 'commands' substitutions; text past a cap is data.
// - An unterminated quote, $(, backtick or ${ makes the rest of the text data.
// - A bash -c or eval body inherits the bindings in effect at the invoking command.

export type Word = { text: string; dynamic: boolean }
export type Assignment = { name: string; value: Word }
export type SimpleCommand = { assignments: Assignment[]; words: Word[] }

const MAX_NEST = 32
const SEPARATOR = /[ \t\n;&|()<>]/
const KEYWORDS = new Set(['{', 'do', 'then', 'else'])

type Read = { text: string; dynamic: boolean; plain: boolean; eqAt: number; fd: boolean; subs: string[] }

export type ScanOptions = { assignmentSubstitutions?: 'data' | 'commands' }

const MAX_DESCENT = 8
type Piece = { text: string; dynamic: boolean; end: number }

class Lexer {
  private i = 0
  private cmd: SimpleCommand = { assignments: [], words: [] }
  private readonly out: SimpleCommand[] = []
  private heredocs: { delimiter: string; strip: boolean }[] = []
  private subs: string[] = []

  constructor(
    private readonly s: string,
    private readonly bindings: Map<string, string>,
    private readonly commands: boolean,
    private readonly descent: number,
  ) {}

  run(): SimpleCommand[] {
    const s = this.s
    while (this.i < s.length) {
      const c = s[this.i]
      if (c === ' ' || c === '\t') this.i++
      else if (c === '\\' && s[this.i + 1] === '\n') this.i += 2
      else if (c === '\n') { this.end(); this.i++; this.heredocBodies() }
      else if (c === '#') { const nl = s.indexOf('\n', this.i); this.i = nl < 0 ? s.length : nl }
      else if (c === '&' && s[this.i + 1] === '>') { this.i += s[this.i + 2] === '>' ? 3 : 2; this.target() }
      else if (c === '<' || c === '>') this.redirect()
      else if (';&|()'.includes(c)) {
        this.end()
        this.i += (c === '&' && s[this.i + 1] === '&') || (c === '|' && (s[this.i + 1] === '|' || s[this.i + 1] === '&')) ? 2 : 1
      } else this.word()
    }
    this.end()
    return this.out
  }

  private end(): void {
    const { assignments, words } = this.cmd
    if (words.length === 0) {
      for (const { name, value } of assignments) {
        if (value.dynamic) this.bindings.delete(name)
        else this.bindings.set(name, value.text)
      }
    }
    if (assignments.length || words.length) {
      this.out.push({ assignments, words })
      const body = words.length ? bodyOf(words) : null
      if (body !== null && this.descent < MAX_DESCENT) this.emit(this.nested(body))
    }
    this.cmd = { assignments: [], words: [] }
  }

  private emit(commands: SimpleCommand[]): void {
    for (const c of commands) this.out.push(c)
  }

  // Scans a substitution or a -c/eval body with a copy of the bindings, so its bindings do not leak out.
  private nested(text: string): SimpleCommand[] {
    return new Lexer(text, new Map(this.bindings), this.commands, this.descent + 1).run()
  }

  private word(): void {
    const r = this.readWord()
    if (r.fd) return
    const { cmd } = this
    if (r.plain && cmd.words.length === 0 && cmd.assignments.length === 0 && KEYWORDS.has(r.text)) return
    if (r.eqAt >= 0 && cmd.words.length === 0) {
      cmd.assignments.push({ name: r.text.slice(0, r.eqAt), value: { text: r.text.slice(r.eqAt + 1), dynamic: r.dynamic } })
      if (this.commands && this.descent < MAX_DESCENT) for (const body of r.subs) this.emit(this.nested(body))
      return
    }
    cmd.words.push({ text: r.text, dynamic: r.dynamic })
  }

  private redirect(): void {
    const s = this.s
    if (s.startsWith('<<<', this.i)) { this.i += 3; this.target() }
    else if (s.startsWith('<<', this.i)) {
      const strip = s[this.i + 2] === '-'
      this.i += strip ? 3 : 2
      const delimiter = this.target()
      this.heredocs.push({ delimiter: delimiter?.text ?? '', strip })
    } else {
      this.i += ['<&', '>&', '>>', '<>', '>|'].includes(s.slice(this.i, this.i + 2)) ? 2 : 1
      this.target()
    }
  }

  // The redirect target is a word of its own and is not a command word.
  private target(): Read | null {
    while (this.s[this.i] === ' ' || this.s[this.i] === '\t') this.i++
    return this.i < this.s.length && !SEPARATOR.test(this.s[this.i]) ? this.readWord() : null
  }

  // A heredoc body starts after the newline that ends its command and ends at a line equal to its delimiter.
  private heredocBodies(): void {
    const s = this.s
    for (const { delimiter, strip } of this.heredocs) {
      while (this.i < s.length) {
        const nl = s.indexOf('\n', this.i)
        const eol = nl < 0 ? s.length : nl
        const line = strip ? s.slice(this.i, eol).replace(/^\t+/, '') : s.slice(this.i, eol)
        this.i = Math.min(eol + 1, s.length)
        if (line === delimiter) break
      }
    }
    this.heredocs = []
  }

  private readWord(): Read {
    const s = this.s
    this.subs = []
    let text = ''
    let dynamic = false
    let plain = true
    let bare = true
    let eqAt = -1
    while (this.i < s.length) {
      const c = s[this.i]
      if (SEPARATOR.test(c)) {
        if ((c === '<' || c === '>') && bare && text !== '') return { text, dynamic, plain, eqAt, fd: true, subs: [] }
        break
      }
      if (c === '\\') {
        plain = false
        bare = false
        if (this.i + 1 >= s.length) text += c
        else if (s[this.i + 1] !== '\n') text += s[this.i + 1]
        this.i += this.i + 1 >= s.length ? 1 : 2
        continue
      }
      if (c === "'") {
        plain = false
        bare = false
        const k = s.indexOf("'", this.i + 1)
        const end = k < 0 ? s.length : k
        text += s.slice(this.i + 1, end)
        this.i = k < 0 ? s.length : k + 1
        continue
      }
      if (c === '"') {
        plain = false
        bare = false
        const r = this.dq(this.i + 1)
        text += r.text
        dynamic ||= r.dynamic
        this.i = r.end
        continue
      }
      if (c === '$' && s[this.i + 1] === "'") {
        plain = false
        bare = false
        let j = this.i + 2
        while (j < s.length && s[j] !== "'") j += s[j] === '\\' ? 2 : 1
        text += s.slice(this.i + 2, Math.min(j, s.length))
        this.i = Math.min(j + 1, s.length)
        continue
      }
      const p = c === '$' || c === '`' ? this.expansionAt(this.i) : null
      if (p) {
        plain = false
        bare = false
        text += p.text
        dynamic ||= p.dynamic
        this.i = p.end
        continue
      }
      if (c === '=' && eqAt < 0 && plain && /^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
        eqAt = text.length
        bare = false
        text += c
        this.i++
        continue
      }
      if (!/[0-9]/.test(c)) bare = false
      text += c
      this.i++
    }
    return { text, dynamic, plain, eqAt, fd: false, subs: this.subs }
  }

  private dq(from: number): Piece {
    const s = this.s
    let text = ''
    let dynamic = false
    let j = from
    while (j < s.length) {
      const c = s[j]
      if (c === '"') return { text, dynamic, end: j + 1 }
      if (c === '\\' && j + 1 < s.length && /["\\`$\n]/.test(s[j + 1])) {
        if (s[j + 1] !== '\n') text += s[j + 1]
        j += 2
        continue
      }
      const p = c === '$' || c === '`' ? this.expansionAt(j) : null
      if (p) {
        text += p.text
        dynamic ||= p.dynamic
        j = p.end
        continue
      }
      text += c
      j++
    }
    return { text, dynamic, end: s.length }
  }

  // The raw text of an unresolved expansion, or null when the $ is a literal dollar sign.
  private expansionAt(j: number): Piece | null {
    const s = this.s
    if (s[j] === '`') {
      const k = this.backtickEnd(j + 1)
      const end = Math.min(k + 1, s.length)
      if (k < s.length) this.subs.push(s.slice(j + 1, k))
      return { text: s.slice(j, end), dynamic: true, end }
    }
    const n = s[j + 1]
    if (n === '(') {
      const k = this.closeParen(j + 2, 0)
      const end = k < 0 ? s.length : k
      if (k >= 0 && s[j + 2] !== '(') this.subs.push(s.slice(j + 2, k - 1))
      return { text: s.slice(j, end), dynamic: true, end }
    }
    if (n === '{') {
      const k = this.braceEnd(j + 2)
      const end = k < 0 ? s.length : k
      return this.resolved(k < 0 ? '' : s.slice(j + 2, k - 1), s.slice(j, end), end)
    }
    if (n !== undefined && /[A-Za-z_]/.test(n)) {
      let k = j + 1
      while (k < s.length && /\w/.test(s[k])) k++
      return this.resolved(s.slice(j + 1, k), s.slice(j, k), k)
    }
    if (n !== undefined && /[0-9?$!#@*-]/.test(n)) return { text: s.slice(j, j + 2), dynamic: true, end: j + 2 }
    return null
  }

  // Only a name the same text assigned a literal value to is replaced; anything else stays raw and dynamic.
  private resolved(name: string, raw: string, end: number): Piece {
    const value = this.bindings.get(name)
    return value === undefined ? { text: raw, dynamic: true, end } : { text: value, dynamic: false, end }
  }

  // Index of the closing backtick, or s.length when unterminated.
  private backtickEnd(from: number): number {
    const s = this.s
    let j = from
    while (j < s.length && s[j] !== '`') j += s[j] === '\\' ? 2 : 1
    return Math.min(j, s.length)
  }

  // Index just past the ')' that closes a $( opened before from, or -1 when unterminated.
  private closeParen(from: number, nest: number): number {
    const s = this.s
    let depth = 1
    let j = from
    while (j < s.length) {
      const c = s[j]
      if (c === '\\') j += 2
      else if (c === "'") {
        const k = s.indexOf("'", j + 1)
        if (k < 0) return -1
        j = k + 1
      } else if (c === '"') {
        if (nest >= MAX_NEST) return -1
        j = this.skipDq(j + 1, nest + 1)
        if (j < 0) return -1
      } else if (c === '`') {
        const k = this.backtickEnd(j + 1)
        if (k >= s.length) return -1
        j = k + 1
      } else {
        if (c === '(') depth++
        else if (c === ')' && --depth === 0) return j + 1
        j++
      }
    }
    return -1
  }

  // Index just past the closing '"' of a double quote opened before from, or -1 when unterminated.
  private skipDq(from: number, nest: number): number {
    const s = this.s
    let j = from
    while (j < s.length) {
      const c = s[j]
      if (c === '\\') j += 2
      else if (c === '"') return j + 1
      else if (c === '`') {
        const k = this.backtickEnd(j + 1)
        if (k >= s.length) return -1
        j = k + 1
      } else if (c === '$' && s[j + 1] === '(') {
        if (nest >= MAX_NEST) return -1
        j = this.closeParen(j + 2, nest + 1)
        if (j < 0) return -1
      } else j++
    }
    return -1
  }

  // Index just past the '}' that closes a ${ opened before from, or -1 when unterminated.
  private braceEnd(from: number): number {
    const s = this.s
    let depth = 1
    let j = from
    while (j < s.length) {
      const c = s[j]
      if (c === '\\') j += 2
      else {
        if (c === '{') depth++
        else if (c === '}' && --depth === 0) return j + 1
        j++
      }
    }
    return -1
  }
}

function bodyOf(words: Word[]): string | null {
  const [head, ...rest] = words
  if (head.text === 'eval') return rest.length ? rest.map((w) => w.text).join(' ') : null
  if (head.text !== 'bash' && head.text !== 'sh') return null
  let k = 0
  let dashC = false
  while (k < rest.length && /^-[A-Za-z]+$/.test(rest[k].text)) {
    if (rest[k].text.includes('c')) dashC = true
    k++
  }
  return dashC && k < rest.length ? rest[k].text : null
}

export function scanCommands(text: string, options: ScanOptions = {}): SimpleCommand[] {
  return new Lexer(text, new Map(), options.assignmentSubstitutions === 'commands', 0).run()
}
