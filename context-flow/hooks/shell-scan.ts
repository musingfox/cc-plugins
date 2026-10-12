// Limits of the scanner, each one true of the code:
// - A variable binds only from a plain NAME=<literal> that is the whole of an assignment-only command; export, declare, local, readonly, for, read and unset do not bind or unbind, so an earlier binding stays in force past them. A later value in the same command reads the earlier ones, which bash does only for an assignment-only command; no caller reads prefix values.
// - A value longer than 1024 characters does not bind, and a binding that is later replaced by a non-literal value is removed.
// - Bindings leak out of subshells and function bodies, since the scanner models neither scope.
// - Only $NAME and ${NAME} expand, and only when bound; every other expansion stays raw and dynamic.
// - No word splitting of a bound unquoted value: CMD=". <root>/env.sh"; $CMD is one word, and no root is found.
// - Assignment-value substitutions are data unless the caller asks for 'commands'; a $(...) inside ${...} is not scanned in 'commands' mode.
// - A heredoc inside $(...) is read as one outside it: its body is skipped when the closing ) is searched for, and a body with no terminator leaves that $(...) unterminated.
// - $"..." keeps a literal $, so . $"<root>/env.sh" finds no root.
// - $'...' escapes are not decoded.
// - In $(...) and in ${...}, quotes and escapes are skipped as they are outside. A # starts a comment in $(...) only at a token start, after an unescaped separator or at the start of $(...); an escaped character or a closed nested $(...) before it does not count, and a backslash-newline does not change it. An escaped space before # is not a token start, as in POSIX; bash 3.2 reads it as a comment.
// - A << inside (( )) is read as a heredoc.
// - A case pattern's ) inside $(...) closes the substitution.
// - No aliases, glob or brace expansion.
// - Command-start keywords are only {, do, then and else.
// - bash and sh take only single-dash flags before -c; --long options are not skipped, so bash --norc -c is not descended.
// - Bound values resolved in one scan total at most four times the scanned text's length; once that budget is spent, further references stay raw and dynamic.
// - f() { ...; } and function f() { ...; } bodies are scanned and their calls are not tracked; in function f { ...; } the first body command folds into the header and is not seen.
// - Nesting caps: 32 levels of double-quote and $(...) recursion, and 8 levels of descent into bash -c, sh -c, eval and 'commands' substitutions. Past the 32-level cap, the outer $( or quote and everything after it is data; past the descent cap, the body stays one word.
// - An unterminated quote, $(, backtick or ${ makes the rest of the text data.
// - A bash -c or eval body inherits the bindings in effect at the invoking command; a binding made inside it does not reach later commands.

export type Word = { text: string; dynamic: boolean }
export type Assignment = { name: string; value: Word }
export type SimpleCommand = { assignments: Assignment[]; words: Word[] }

const MAX_NEST = 32
const MAX_VALUE = 1024
const SEPARATOR = /[ \t\n;&|()<>]/
const KEYWORDS = new Set(['{', 'do', 'then', 'else'])

type Read = { text: string; dynamic: boolean; plain: boolean; eqAt: number; fd: boolean; subs: string[] }

export type ScanOptions = { assignmentSubstitutions?: 'data' | 'commands' }

const MAX_DESCENT = 8
type Piece = { text: string; dynamic: boolean; end: number }

// The bindings of one scan. A nested scan reads its parents and writes only its own entries, so nothing is copied; null marks an unbound name.
class Scope {
  private readonly own = new Map<string, string | null>()

  constructor(private readonly parent: Scope | null) {}

  get(name: string): string | undefined {
    for (let scope: Scope | null = this; scope; scope = scope.parent) {
      if (scope.own.has(name)) return scope.own.get(name) ?? undefined
    }
    return undefined
  }

  set(name: string, value: string | null): void {
    this.own.set(name, value)
  }
}

class Lexer {
  private i = 0
  private cmd: SimpleCommand = { assignments: [], words: [] }
  private readonly out: SimpleCommand[] = []
  private heredocs: { delimiter: string; strip: boolean }[] = []
  private subs: string[] = []
  // The values of the current command's assignments, read by later values of the same command.
  private pending = new Map<string, string | null>()
  private assigning = false

  constructor(
    private readonly s: string,
    private readonly bindings: Scope,
    private readonly commands: boolean,
    private readonly descent: number,
    private readonly budget: { left: number },
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
        this.bindings.set(name, value.dynamic || value.text.length > MAX_VALUE ? null : value.text)
      }
    }
    if (assignments.length || words.length) {
      this.out.push({ assignments, words })
      const body = words.length ? bodyOf(words) : null
      if (body !== null && this.descent < MAX_DESCENT) this.emit(this.nested(body))
    }
    this.cmd = { assignments: [], words: [] }
    this.pending.clear()
  }

  private emit(commands: SimpleCommand[]): void {
    for (const c of commands) this.out.push(c)
  }

  // Scans a substitution or a -c/eval body in a child scope that reads the parent's bindings and keeps its own writes, so its bindings do not leak out.
  private nested(text: string): SimpleCommand[] {
    return new Lexer(text, new Scope(this.bindings), this.commands, this.descent + 1, this.budget).run()
  }

  private word(): void {
    const r = this.readWord()
    if (r.fd) return
    const { cmd } = this
    if (r.plain && cmd.words.length === 0 && cmd.assignments.length === 0 && KEYWORDS.has(r.text)) return
    if (r.eqAt >= 0 && cmd.words.length === 0) {
      const name = r.text.slice(0, r.eqAt)
      const value = { text: r.text.slice(r.eqAt + 1), dynamic: r.dynamic }
      cmd.assignments.push({ name, value })
      this.pending.set(name, value.dynamic || value.text.length > MAX_VALUE ? null : value.text)
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
      const delimiter = this.target(true)
      this.heredocs.push({ delimiter: delimiter?.text ?? '', strip })
    } else {
      this.i += ['<&', '>&', '>>', '<>', '>|'].includes(s.slice(this.i, this.i + 2)) ? 2 : 1
      this.target()
    }
  }

  // The redirect target is a word of its own and is not a command word.
  private target(literal = false): Read | null {
    while (this.s[this.i] === ' ' || this.s[this.i] === '\t') this.i++
    return this.i < this.s.length && !SEPARATOR.test(this.s[this.i]) ? this.readWord(literal) : null
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

  // A literal word takes quote removal only; its $ and backticks are not expanded, as for a heredoc delimiter.
  private readWord(literal = false): Read {
    const s = this.s
    this.subs = []
    let text = ''
    let dynamic = false
    let plain = true
    let bare = true
    let eqAt = -1
    this.assigning = false
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
        text += s.slice(this.i + 1, k < 0 ? s.length : k)
        this.i = k < 0 ? s.length : k + 1
        continue
      }
      if (c === '"') {
        plain = false
        bare = false
        const r = this.dq(this.i + 1, literal)
        text += r.text
        dynamic ||= r.dynamic
        this.i = r.end
        continue
      }
      if (c === '$' && s[this.i + 1] === "'") {
        plain = false
        bare = false
        const k = this.ansiEnd(this.i + 2)
        text += s.slice(this.i + 2, k < 0 ? s.length : k)
        this.i = k < 0 ? s.length : k + 1
        continue
      }
      if (literal && (c === '`' || (c === '$' && (s[this.i + 1] === '(' || s[this.i + 1] === '{')))) {
        plain = false
        bare = false
        const k = this.skipUnit(this.i, 0)
        const end = k < 0 ? s.length : k
        text += s.slice(this.i, end)
        this.i = end
        continue
      }
      const p = !literal && (c === '$' || c === '`') ? this.expansionAt(this.i) : null
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
        this.assigning = this.cmd.words.length === 0
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

  private dq(from: number, literal: boolean): Piece {
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
      const p = !literal && (c === '$' || c === '`') ? this.expansionAt(j) : null
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
      const end = k < 0 ? s.length : k + 1
      if (k >= 0) this.subs.push(s.slice(j + 1, k))
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
      const k = this.braceEnd(j + 2, 0)
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
    const value = this.assigning && this.pending.has(name) ? this.pending.get(name) ?? undefined : this.bindings.get(name)
    if (value === undefined || value.length > this.budget.left) return { text: raw, dynamic: true, end }
    this.budget.left -= value.length
    return { text: value, dynamic: false, end }
  }

  // Index of the closing backtick, or -1 when unterminated.
  private backtickEnd(from: number): number {
    const s = this.s
    let j = from
    while (j < s.length && s[j] !== '`') j += s[j] === '\\' ? 2 : 1
    return j < s.length ? j : -1
  }

  // Index of the closing quote of an ANSI-C string whose body starts at from, or -1 when unterminated.
  private ansiEnd(from: number): number {
    const s = this.s
    let j = from
    while (j < s.length && s[j] !== "'") j += s[j] === '\\' ? 2 : 1
    return j < s.length ? j : -1
  }

  // Index just past the quoted, escaped or nested unit that starts at j, or -1 when unterminated. Shared by every boundary finder so that quoting is read the same way everywhere.
  private skipUnit(j: number, nest: number): number {
    const s = this.s
    const c = s[j]
    if (c === '\\') return j + 2
    if (c === "'") {
      const k = s.indexOf("'", j + 1)
      return k < 0 ? -1 : k + 1
    }
    if (c === '$' && s[j + 1] === "'") {
      const k = this.ansiEnd(j + 2)
      return k < 0 ? -1 : k + 1
    }
    if (c === '`') {
      const k = this.backtickEnd(j + 1)
      return k < 0 ? -1 : k + 1
    }
    if (c === '"' || c === '$') {
      if (c === '$' && s[j + 1] !== '(' && s[j + 1] !== '{') return j + 1
      if (nest >= MAX_NEST) return -1
      if (c === '"') return this.skipDq(j + 1, nest + 1)
      return s[j + 1] === '(' ? this.closeParen(j + 2, nest + 1) : this.braceEnd(j + 2, nest + 1)
    }
    return j + 1
  }

  // Index just past the ')' that closes a $( opened before from, or -1 when unterminated.
  private closeParen(from: number, nest: number): number {
    const s = this.s
    let depth = 1
    let j = from
    let start = true
    let heredocs: { delimiter: string; strip: boolean }[] = []
    while (j < s.length) {
      const c = s[j]
      if (c === '#' && start) {
        const nl = s.indexOf('\n', j)
        if (nl < 0) return -1
        j = nl
      } else if (c === '\\' && s[j + 1] === '\n') {
        j += 2
      } else if (c === '<' && s[j + 1] === '<') {
        start = false
        if (s[j + 2] === '<') {
          j += 3
          continue
        }
        const strip = s[j + 2] === '-'
        const d = this.heredocDelimiter(j + (strip ? 3 : 2), nest)
        if (d.end < 0) return -1
        heredocs.push({ delimiter: d.text, strip })
        j = d.end
      } else if (c === '\n' && heredocs.length) {
        j = this.skipHeredocBodies(j + 1, heredocs)
        if (j < 0) return -1
        heredocs = []
        start = true
      } else if (c === '(') {
        depth++
        j++
        start = true
      } else if (c === ')') {
        if (--depth === 0) return j + 1
        j++
        start = true
      } else if (c === '\\' || c === "'" || c === '"' || c === '`' || c === '$') {
        j = this.skipUnit(j, nest)
        if (j < 0) return -1
        start = false
      } else {
        start = SEPARATOR.test(c)
        j++
      }
    }
    return -1
  }

  // The delimiter word of a heredoc read inside $(...), with quotes removed, and the index just past it (-1 when unterminated).
  private heredocDelimiter(from: number, nest: number): { text: string; end: number } {
    const s = this.s
    let j = from
    let text = ''
    while (s[j] === ' ' || s[j] === '\t') j++
    while (j < s.length && !SEPARATOR.test(s[j])) {
      const k = this.skipUnit(j, nest)
      if (k < 0) return { text, end: -1 }
      const quoted = s[j] === "'" || s[j] === '"' || (s[j] === '$' && s[j + 1] === "'")
      if (s[j] === '\\') text += s.slice(j + 1, k)
      else if (quoted) text += s.slice(s[j] === '$' ? j + 2 : j + 1, k - 1)
      else text += s.slice(j, k)
      j = k
    }
    return { text, end: j }
  }

  // Index just past the last heredoc body line that starts at from, or -1 when a terminator is missing.
  private skipHeredocBodies(from: number, heredocs: { delimiter: string; strip: boolean }[]): number {
    const s = this.s
    let j = from
    for (const { delimiter, strip } of heredocs) {
      for (;;) {
        if (j >= s.length) return -1
        const nl = s.indexOf('\n', j)
        const eol = nl < 0 ? s.length : nl
        const line = strip ? s.slice(j, eol).replace(/^\t+/, '') : s.slice(j, eol)
        j = eol + 1
        if (line === delimiter) break
      }
    }
    return j
  }

  // Index just past the closing '"' of a double quote opened before from, or -1 when unterminated.
  private skipDq(from: number, nest: number): number {
    const s = this.s
    let j = from
    while (j < s.length) {
      const c = s[j]
      if (c === '"') return j + 1
      if (c === '\\' || c === '`' || (c === '$' && (s[j + 1] === '(' || s[j + 1] === '{'))) {
        j = this.skipUnit(j, nest)
        if (j < 0) return -1
      } else j++
    }
    return -1
  }

  // Index just past the '}' that closes a ${ opened before from, or -1 when unterminated.
  private braceEnd(from: number, nest: number): number {
    const s = this.s
    let depth = 1
    let j = from
    while (j < s.length) {
      const c = s[j]
      if (c === '}') {
        if (--depth === 0) return j + 1
        j++
      } else if (c === '{') {
        depth++
        j++
      } else if (c === '\\' || c === "'" || c === '"' || c === '`' || c === '$') {
        j = this.skipUnit(j, nest)
        if (j < 0) return -1
      } else j++
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
  return new Lexer(text, new Scope(null), options.assignmentSubstitutions === 'commands', 0, { left: 4 * text.length }).run()
}
