import { expect, test } from 'claude-code/testing'
import { scanCommands, type SimpleCommand } from '../hooks/shell-scan.ts'
import { cleanupTargetOf, isImplementCommand, isSetupCommand, sourcedRootOf } from '../hooks/cf-signals.ts'

const argv = (commands: SimpleCommand[]) => commands.map((c) => c.words.map((w) => w.text)).filter((words) => words.length > 0)
const assigns = (c: SimpleCommand) => c.assignments.map((a) => [a.name, a.value.text])
const dynamics = (c: SimpleCommand) => c.words.map((w) => w.dynamic)

test('ScanAssignmentPrefix T1 leading NAME=value words are assignments', () => {
  const [c] = scanCommands('A=1 B="x y" cmd arg')
  expect(assigns(c)).toEqual([['A', '1'], ['B', 'x y']])
  expect(argv([c])).toEqual([['cmd', 'arg']])
})

test('ScanAssignmentPrefix T2 a dynamic value is kept raw and marked dynamic', () => {
  const [c] = scanCommands('PATH="$HOME"/bin:$PATH cf-pi-run.sh')
  expect(c.assignments[0].name).toBe('PATH')
  expect(c.assignments[0].value).toEqual({ text: '$HOME/bin:$PATH', dynamic: true })
  expect(argv([c])).toEqual([['cf-pi-run.sh']])
})

test('ScanAssignmentPrefix T3 a substitution value is an assignment and the next word is the command', () => {
  const [a] = scanCommands('X=$(date) cf-pi-run.sh a')
  expect(assigns(a)).toEqual([['X', '$(date)']])
  expect(argv([a])).toEqual([['cf-pi-run.sh', 'a']])
  const [b] = scanCommands('X=`date` run')
  expect(assigns(b)).toEqual([['X', '`date`']])
  expect(argv([b])).toEqual([['run']])
})

test('ScanAssignmentPrefix T4 a quoted value with a separator stays one value', () => {
  const [c] = scanCommands("A=$'a b;c' run")
  expect(assigns(c)).toEqual([['A', 'a b;c']])
  expect(argv([c])).toEqual([['run']])
})

test('ScanAssignmentPrefix T5 a NAME= after the command word is an argument', () => {
  const [echo] = scanCommands('echo A=1')
  expect(echo.assignments).toEqual([])
  expect(argv([echo])).toEqual([['echo', 'A=1']])
  const [quoted] = scanCommands('"A=1" run')
  expect(quoted.assignments).toEqual([])
  expect(argv([quoted])).toEqual([['A=1', 'run']])
})

test('ScanAssignmentPrefix T6 an assignment alone has no words', () => {
  const [c] = scanCommands('A=1')
  expect(assigns(c)).toEqual([['A', '1']])
  expect(c.words).toEqual([])
})

test('ScanAssignmentPrefix T7 two hundred empty assignments are all reported before the command', () => {
  const [c] = scanCommands("A='' ".repeat(200) + 'make')
  expect(c.assignments.length).toBe(200)
  expect(argv([c])).toEqual([['make']])
})

test('ScanCommandPositions T1 semicolon separates commands', () => {
  expect(argv(scanCommands('a b; c d'))).toEqual([['a', 'b'], ['c', 'd']])
})

test('ScanCommandPositions T2 every operator and newline separates commands', () => {
  expect(argv(scanCommands('a && b || c | d & e\nf'))).toEqual([['a'], ['b'], ['c'], ['d'], ['e'], ['f']])
})

test('ScanCommandPositions T3 a separator inside double quotes is not a position', () => {
  expect(argv(scanCommands('echo "x; . /tmp/cf-1008-Rez6/env.sh"'))).toEqual([['echo', 'x; . /tmp/cf-1008-Rez6/env.sh']])
})

test('ScanCommandPositions T4 separators inside single quotes are not positions', () => {
  expect(argv(scanCommands("echo 'a && b' \"c | d\""))).toEqual([['echo', 'a && b', 'c | d']])
})

test('ScanCommandPositions T5 a keyword-led body command is a command', () => {
  expect(argv(scanCommands('for f in 1; do . "/tmp/cf-1008-Rez6/env.sh"; done'))).toContainEqual(['.', '/tmp/cf-1008-Rez6/env.sh'])
})

test('ScanCommandPositions T6 then, else and braces start commands', () => {
  const ifArgv = argv(scanCommands('if true; then X; else Y; fi'))
  expect(ifArgv).toContainEqual(['X'])
  expect(ifArgv).toContainEqual(['Y'])
  expect(argv(scanCommands('{ x; }'))).toContainEqual(['x'])
})

test('ScanCommandPositions T7 a case arm body is a command', () => {
  expect(argv(scanCommands('case "$R" in OK*|NOOP*) bash "$CLEANUP_SCRIPT" >/dev/null 2>&1;; esac'))).toContainEqual(['bash', '$CLEANUP_SCRIPT'])
})

test('ScanCommandPositions T8 a hash starts a comment only at a token start', () => {
  expect(argv(scanCommands('ls # . /tmp/cf-1008-Rez6/env.sh\npwd'))).toEqual([['ls'], ['pwd']])
  expect(argv(scanCommands('echo a#b'))).toEqual([['echo', 'a#b']])
})

test('ScanCommandPositions T9 an escaped separator is data', () => {
  expect(argv(scanCommands('echo a\\;b'))).toEqual([['echo', 'a;b']])
  expect(argv(scanCommands('echo \\"a; ls\\"'))).toEqual([['echo', '"a'], ['ls"']])
})

test('ScanCommandPositions T10 a backslash-newline joins the word', () => {
  expect(argv(scanCommands('ec\\\nho x'))).toEqual([['echo', 'x']])
})

test('ScanCommandPositions T11 a separator inside a command substitution in double quotes is data', () => {
  expect(argv(scanCommands('echo "A returned $(date +%s)" >> x.log'))).toEqual([['echo', 'A returned $(date +%s)']])
})

test('ScanCommandPositions T12 a nested quoted substitution stays inside its word', () => {
  expect(argv(scanCommands('printf \'T=%s\\n\' "$(printf \'%q\' \'a b\')" >> "$SESSION/env.sh"'))).toEqual([['printf', 'T=%s\\n', '$(printf \'%q\' \'a b\')']])
})

test('ScanCommandPositions T13 an ANSI-C quote with a separator is one word', () => {
  expect(scanCommands("echo $'a;b' $'it\\'s; ls'").length).toBe(1)
})

test('ScanCommandPositions T14 an unterminated quote or substitution makes the rest data', () => {
  expect(argv(scanCommands('echo "a; ls'))).toEqual([['echo', 'a; ls']])
  expect(scanCommands('echo $(ls; pwd').length).toBe(1)
  expect(scanCommands('echo `ls; pwd').length).toBe(1)
  expect(scanCommands('')).toEqual([])
})

test('ScanCommandPositions T15 a quoted keyword is a word', () => {
  expect(argv(scanCommands('"do" x'))).toEqual([['do', 'x']])
})

test('ScanWordText T1 quotes and expansions give text and dynamic flags', () => {
  const [c] = scanCommands('"$SCRIPTS/cf-pi-run.sh" \'a b\' c"d"\'e\'')
  expect(argv([c])).toEqual([['$SCRIPTS/cf-pi-run.sh', 'a b', 'cde']])
  expect(dynamics(c)).toEqual([true, false, false])
})

test('ScanWordText T2 redirects and their targets are not words', () => {
  expect(argv(scanCommands('cf-pi-run.sh>out 2>&1 x'))).toEqual([['cf-pi-run.sh', 'x']])
})

test('ScanWordText T3 every redirect operator is skipped with its target', () => {
  expect(argv(scanCommands('cmd <in >out 2>>err'))).toEqual([['cmd']])
  expect(argv(scanCommands('cmd &> f; ls'))).toEqual([['cmd'], ['ls']])
  expect(argv(scanCommands('ls |& cat'))).toEqual([['ls'], ['cat']])
})

test('ScanWordText T4 an ANSI-C quoted separator is literal text', () => {
  expect(argv(scanCommands("echo $'a;b'"))).toEqual([['echo', 'a;b']])
})

test('ScanWordText T5 an escaped double quote inside double quotes is literal', () => {
  expect(argv(scanCommands('echo "a\\"b"'))).toEqual([['echo', 'a"b']])
})

test('ScanWordText T6 a double-quoted flag-looking path is one word', () => {
  expect(argv(scanCommands('bash "-x/cf-pi-run.sh"'))).toEqual([['bash', '-x/cf-pi-run.sh']])
})

test('ScanWordText T7 parameter, arithmetic and command expansions are dynamic words', () => {
  const [c] = scanCommands('echo ${S:-d} $((1+2)) $(ls)')
  expect(argv([c])).toEqual([['echo', '${S:-d}', '$((1+2))', '$(ls)']])
  expect(dynamics(c)).toEqual([false, true, true, true])
})

test('ScanHeredocBodies T1 a heredoc body is data and the line after its terminator is a command', () => {
  expect(argv(scanCommands('cat <<EOF\n. /tmp/cf-1008-Rez6/env.sh\nEOF\nls'))).toEqual([['cat'], ['ls']])
})

test('ScanHeredocBodies T2 a quoted delimiter with a redirect still ends the body', () => {
  expect(argv(scanCommands("cat <<'EOF' > f\n. /tmp/cf-1008-Rez6/env.sh\nEOF\n. /tmp/cf-1008-Ab12/env.sh"))).toEqual([['cat'], ['.', '/tmp/cf-1008-Ab12/env.sh']])
})

test('ScanHeredocBodies T3 a dash heredoc matches its terminator after stripping tabs', () => {
  expect(argv(scanCommands('cat <<-"EOF"\n\t. /tmp/cf-1008-Rez6/env.sh\n\tEOF\nls'))).toEqual([['cat'], ['ls']])
})

test('ScanHeredocBodies T4 several heredocs on one line consume their bodies in order', () => {
  expect(argv(scanCommands('cat <<A <<B\nx\nA\ny\nB\nls'))).toEqual([['cat'], ['ls']])
})

test('ScanHeredocBodies T5 a here-string swallows nothing', () => {
  expect(argv(scanCommands("cat <<< 'x; y'\nls"))).toEqual([['cat'], ['ls']])
})

test('ScanHeredocBodies T6 a missing terminator makes the rest of the text the body', () => {
  expect(argv(scanCommands('cat <<EOF\nls'))).toEqual([['cat']])
})

test('ScanHeredocBodies T7 a command after the heredoc operator on the same line still runs', () => {
  expect(argv(scanCommands('cat <<EOF; ls\nbody\nEOF'))).toEqual([['cat'], ['ls']])
})

test('ScanHeredocBodies R1 a variable in the delimiter is literal, so the body ends only at that text', () => {
  expect(argv(scanCommands('S=EOF; cat <<$S\nEOF\n. /tmp/cf-1008-Rez6/env.sh\n$S'))).toEqual([['cat']])
  expect(argv(scanCommands('S=EOF; cat <<"$S"\nEOF\n. /tmp/cf-1008-Rez6/env.sh\n$S'))).toEqual([['cat']])
  expect(argv(scanCommands('S=EOF; cat <<$S\nEOF\n$S\n. /tmp/cf-1008-Rez6/env.sh'))).toEqual([['cat'], ['.', '/tmp/cf-1008-Rez6/env.sh']])
})

test('ScanVariableResolution T1 a plainly assigned literal replaces $S in the same text', () => {
  const [, c] = scanCommands('S=/tmp/cf-1008-Rez6; echo $S/env.sh')
  expect(argv([c])).toEqual([['echo', '/tmp/cf-1008-Rez6/env.sh']])
  expect(dynamics(c)).toEqual([false, false])
})

test('ScanVariableResolution T2 braced and double-quoted uses resolve, single quotes do not', () => {
  const [, c] = scanCommands('S="/tmp/cf-1008-Rez6"; echo ${S}/x "$S" \'$S\'')
  expect(argv([c])).toEqual([['echo', '/tmp/cf-1008-Rez6/x', '/tmp/cf-1008-Rez6', '$S']])
})

test('ScanVariableResolution T3 an unbound variable stays raw and dynamic', () => {
  const [c] = scanCommands('echo $S/x')
  expect(argv([c])).toEqual([['echo', '$S/x']])
  expect(dynamics(c)).toEqual([false, true])
})

test('ScanVariableResolution T4 a substitution value leaves the name unbound', () => {
  expect(argv(scanCommands('S=$(pwd); echo $S'))).toEqual([['echo', '$S']])
  expect(argv(scanCommands('S=a; S=$(pwd); echo $S'))).toEqual([['echo', '$S']])
})

test('ScanVariableResolution T5 a prefix assignment on a command does not bind', () => {
  expect(argv(scanCommands('S=a echo $S'))).toEqual([['echo', '$S']])
})

test('ScanVariableResolution T6 each name resolves to its own value', () => {
  expect(argv(scanCommands('S=a; S2=b; echo $S2'))).toEqual([['echo', 'b']])
})

test('ScanVariableResolution T7 a value that uses an earlier binding resolves too', () => {
  expect(argv(scanCommands('A=/x; B=$A/y; echo $B'))).toEqual([['echo', '/x/y']])
})

test('ScanVariableResolution T8 export is a limit: its assignment does not bind', () => {
  expect(argv(scanCommands('export S=/tmp/cf-1008-Rez6; echo $S'))).toEqual([['export', 'S=/tmp/cf-1008-Rez6'], ['echo', '$S']])
})

test('ScanVariableResolution T9 a default-value expansion is never resolved', () => {
  expect(argv(scanCommands('S=a; echo ${S:-d}'))).toEqual([['echo', '${S:-d}']])
})

const COMMANDS = { assignmentSubstitutions: 'commands' } as const

test('ScanAssignmentSubstitutions T1 an assignment substitution is data by default', () => {
  const commands = scanCommands('SESSION=$("$SCRIPTS/cf-pi-setup.sh" s)')
  expect(commands.length).toBe(1)
  expect(assigns(commands[0])).toEqual([['SESSION', '$("$SCRIPTS/cf-pi-setup.sh" s)']])
  expect(commands[0].words).toEqual([])
})

test('ScanAssignmentSubstitutions T2 in commands mode the substitution command is scanned', () => {
  expect(argv(scanCommands('SESSION=$("$SCRIPTS/cf-pi-setup.sh" s)', COMMANDS))).toContainEqual(['$SCRIPTS/cf-pi-setup.sh', 's'])
})

test('ScanAssignmentSubstitutions T3 a backtick substitution is scanned in commands mode', () => {
  expect(argv(scanCommands('S=`"$X/cf-pi-setup.sh" s`', COMMANDS))).toContainEqual(['$X/cf-pi-setup.sh', 's'])
})

test('ScanAssignmentSubstitutions T4 a substitution in a word is not an assignment and is not scanned', () => {
  expect(argv(scanCommands('echo "$(ls)"', COMMANDS))).toEqual([['echo', '$(ls)']])
})

test('ScanAssignmentSubstitutions T5 bindings made inside a substitution do not leak out', () => {
  expect(argv(scanCommands('X=$(S=a; true); echo $S', COMMANDS))).toContainEqual(['echo', '$S'])
})

test('ScanAssignmentSubstitutions T6 the substitution command runs before the carrying command', () => {
  expect(argv(scanCommands('X=$(date) cf-pi-run.sh', COMMANDS))).toEqual([['date'], ['cf-pi-run.sh']])
})

test('ScanStringBodyDescent T1 a bash -c body is scanned right after the invoking command', () => {
  expect(argv(scanCommands("bash -c '. /tmp/cf-1008-Rez6/env.sh'"))).toEqual([['bash', '-c', '. /tmp/cf-1008-Rez6/env.sh'], ['.', '/tmp/cf-1008-Rez6/env.sh']])
})

test('ScanStringBodyDescent T2 sh -c and a letter cluster with c are scanned', () => {
  expect(argv(scanCommands('sh -c "echo hi; ls"'))).toContainEqual(['echo', 'hi'])
  expect(argv(scanCommands("bash -lc 'ls'"))).toContainEqual(['ls'])
})

test('ScanStringBodyDescent T3 eval joins its arguments and scans them', () => {
  expect(argv(scanCommands('eval ". /tmp/cf-1008-Rez6/env.sh"'))).toContainEqual(['.', '/tmp/cf-1008-Rez6/env.sh'])
  expect(argv(scanCommands('eval . /tmp/cf-1008-Rez6/env.sh'))).toContainEqual(['.', '/tmp/cf-1008-Rez6/env.sh'])
})

test('ScanStringBodyDescent T4 a non-flag word before -c, or -c with no body, adds nothing', () => {
  expect(argv(scanCommands('bash script.sh -c x'))).toEqual([['bash', 'script.sh', '-c', 'x']])
  expect(argv(scanCommands('bash -c'))).toEqual([['bash', '-c']])
})

test('ScanStringBodyDescent T5 a nested bash -c body is scanned', () => {
  expect(argv(scanCommands("bash -c \"bash -c '. /tmp/cf-1008-Rez6/env.sh'\""))).toContainEqual(['.', '/tmp/cf-1008-Rez6/env.sh'])
})

test('ScanStringBodyDescent T6 the body commands come before the next command', () => {
  const text = "bash -c '. /tmp/cf-1008-Ab12/env.sh'; . /tmp/cf-1008-Rez6/env.sh"
  const list = argv(scanCommands(text))
  expect(list.findIndex((w) => w[1] === '/tmp/cf-1008-Ab12/env.sh')).toBeLessThan(list.findIndex((w) => w[1] === '/tmp/cf-1008-Rez6/env.sh'))
})

test('ScanStringBodyDescent T7 an eval body sees the bindings in effect', () => {
  expect(argv(scanCommands("S=/tmp/cf-1008-Rez6; eval '. $S/env.sh'"))).toContainEqual(['.', '/tmp/cf-1008-Rez6/env.sh'])
})

test('ScanStringBodyDescent T8 echoing a bash -c string does not descend', () => {
  expect(argv(scanCommands('echo "bash -c \'ls\'"'))).toEqual([['echo', "bash -c 'ls'"]])
})

test('ScanStringBodyDescent T9 descent stops at eight levels and returns', () => {
  let t = 'ls'
  for (let k = 0; k < 12; k++) t = 'eval ' + JSON.stringify(t)
  expect(scanCommands(t)[0].words[0].text).toBe('eval')
})

const LARGE = ['$('.repeat(100000), '('.repeat(100000), '"$('.repeat(50000), 'bash -c "'.repeat(50000)]

test('ScanTotalAndLinear T2 nesting past the caps is data and returns', () => {
  for (const text of LARGE) expect(() => scanCommands(text)).not.toThrow()
})

test('ScanTotalAndLinear T3 large inputs finish in under one second each', () => {
  const inputs = ['a '.repeat(50000), "'x'".repeat(30000), '$(a '.repeat(30000), '<<E\n'.repeat(20000)]
  for (const text of inputs) {
    const t = performance.now()
    scanCommands(text)
    expect(performance.now() - t).toBeLessThan(1000)
  }
})

test('ScanTotalAndLinear T1 scanCommands returns for empty and lone-delimiter inputs', () => {
  const inputs = ['', ' ', '"', "'", '`', '$(', '${', '\\', '<<', '<<EOF', 'a=', '=', '(', ')', '$((', ';;', '\u0000']
  for (const text of inputs) expect(() => scanCommands(text)).not.toThrow()
})

test("ScanAssignmentPrefix R1 an ANSI-C quote with an escaped quote in a substitution keeps the command word", () => {
  const [c] = scanCommands("X=$(echo $'it\\'s') cf-pi-run.sh")
  expect(c.words.map((w) => w.text)).toEqual(['cf-pi-run.sh'])
})

test('ScanAssignmentSubstitutions R1 a comment holding ")" does not end a data substitution', () => {
  expect(argv(scanCommands('X=$(echo hi # a ) b\n. /tmp/cf-1008-Rez6/env.sh\n)'))).toEqual([])
})

test("ScanCommandPositions R1 an escaped quote in an ANSI-C string inside a substitution ends it", () => {
  expect(scanCommands("X=$(echo $'it\\'s'); ls").length).toBe(2)
})

test('ScanCommandPositions R2 a quoted brace inside a default expansion ends the expansion', () => {
  expect(scanCommands('echo ${X:-"}"}; ls').length).toBe(2)
})

test("ScanCommandPositions R3 an apostrophe in a comment inside a substitution ends at the closing paren", () => {
  expect(scanCommands("X=$(ls # don't\n)\nls").length).toBe(2)
})

test('ScanTotalAndLinear R1 chained doubling assignments finish quickly and do not throw', () => {
  let text = 'V0=xx'
  for (let i = 1; i <= 30; i++) text += `; V${i}=$V${i - 1}$V${i - 1}`
  const t0 = performance.now()
  scanCommands(text)
  sourcedRootOf(text)
  expect(performance.now() - t0).toBeLessThan(50)
})

test('ScanTotalAndLinear R2 many bindings do not make a long script superlinear', () => {
  const build = (k: number) => {
    let s = ''
    for (let i = 0; i < k; i++) s += `A${i}=1; `
    return s + 'eval x; '.repeat(k)
  }
  const best = (s: string) => {
    let m = Infinity
    for (let r = 0; r < 3; r++) {
      const t0 = performance.now()
      scanCommands(s)
      m = Math.min(m, performance.now() - t0)
    }
    return m
  }
  const small = build(6000)
  const large = build(24000)
  expect(best(large)).toBeLessThan(8 * best(small))
})

test('ScanTotalAndLinear R3 eval re-expansion of held references returns within 50 ms', () => {
  let text = `V0=${'x'.repeat(1000)}`
  for (let i = 1; i <= 4; i++) text += `; V${i}='${`$V${i - 1}`.repeat(60)}'`
  text += '; eval eval eval eval $V4'
  const t0 = performance.now()
  expect(() => [scanCommands(text), isImplementCommand(text), isSetupCommand(text), sourcedRootOf(text), cleanupTargetOf(text)]).not.toThrow()
  expect(performance.now() - t0).toBeLessThan(50)
})
