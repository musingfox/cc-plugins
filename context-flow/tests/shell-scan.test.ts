import { expect, test } from 'claude-code/testing'
import { scanCommands, type SimpleCommand } from '../hooks/shell-scan.ts'

const argv = (commands: SimpleCommand[]) => commands.map((c) => c.words.map((w) => w.text))
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
