import type { CleanupTarget, FlowPhase, ImplementFiguresResult } from '../types/index.d.ts'
import { scanCommands, type ScanOptions, type SimpleCommand, type Word } from './shell-scan.ts'

const ROOT_SUFFIX_CHARS = 'A-Za-z0-9'
const ROOT = `/tmp/cf-\\d{4}-[${ROOT_SUFFIX_CHARS}]{4}`

// cf-pi-setup.sh prints the session path alone on stdout; cf.md echoes it again as SESSION=<root>.
export function sessionRootOf(stdout: string): string | null {
  return stdout.match(new RegExp(`^SESSION=(${ROOT})$`, 'm'))?.[1] ?? null
}

// A regex cannot see quoting or heredocs, so a separator inside a quoted string or a heredoc body still counts as a position.
function executedPattern(name: string, runner: 'optional' | 'source', prefix: boolean): RegExp {
  const position = '(?:^|(?<=[\\n;&|()])|(?<=\\{)(?=\\s)|(?<!\\w)(?:do|then|else)(?!\\w))'
  const assignments = `(?:\\w+=(?:'[^']*'|"[^"]*"|(?!['"])[^\\s;&|()]*)[ \\t]+)*`
  const runnerWord = runner === 'source' ? '(?:\\.|source)[ \\t]+(?!["\']?-)' : '(?:(?:bash|sh|\\.|source)[ \\t]+(?!["\']?-))?'
  const path = prefix ? '(?:[^\\s"\';&|()]*\\/)?' : ''
  return new RegExp(`${position}[ \\t]*${assignments}${runnerWord}["']?${path}${name}["']?(?=[\\s;&|)<>]|$)`, 'g')
}

// Every cf Bash after setup starts with `. "<root>/env.sh"`; a shard's env.sh sits one level deeper and does not match.
export function sourcedRootOf(command: string): string | null {
  let root: string | null = null
  for (const { words } of scanCommands(command)) {
    const [first, next] = words
    if ((first?.text === '.' || first?.text === 'source') && next && !next.text.startsWith('-')) {
      root = next.text.match(new RegExp(`^(${ROOT})/env\\.sh$`))?.[1] ?? root
    }
  }
  return root
}

export function phaseOfAgent(subagentType: unknown): Exclude<FlowPhase, 'setup'> | null {
  switch (subagentType) {
    case 'cf:research': return 'research'
    case 'cf:plan': return 'plan'
    case 'cf:implement': return 'implement'
    case 'cf:review': return 'review'
    default: return null
  }
}

const RUNNERS = new Set(['bash', 'sh', '.', 'source'])

// The word a command executes: its first word, or the script after a runner whose next word is not flag-led.
function executedWordOf({ words }: SimpleCommand): Word | null {
  const [first, next] = words
  if (!first) return null
  if (!RUNNERS.has(first.text)) return first
  return next && !next.text.startsWith('-') ? next : null
}

const executesScript = (command: string, script: string, options?: ScanOptions): boolean =>
  scanCommands(command, options).some((c) => executedWordOf(c)?.text.match(new RegExp(`(^|/)${script}$`)) != null)

export const isImplementCommand = (command: string): boolean => executesScript(command, 'cf-pi-(?:worktree|shard|run)\\.sh')

// The setup's SESSION=$(...) runs its script, so assignment substitutions are scanned for it.
export const isSetupCommand = (command: string): boolean => executesScript(command, 'cf-pi-setup\\.sh', { assignmentSubstitutions: 'commands' })

// A setup whose output has no SESSION= line alone still prints the root; the first root not followed by more name wins.
export const setupRootOf = (output: string): string | null => output.match(new RegExp(`(${ROOT})(?![${ROOT_SUFFIX_CHARS}])`))?.[1] ?? null

// 'any' when the command runs whatever env.sh's CLEANUP_SCRIPT names; else the roots of every literal <root>/cleanup.sh it runs.
export function cleanupTargetOf(command: string): CleanupTarget | null {
  if (executedPattern('\\$(?:CLEANUP_SCRIPT|\\{CLEANUP_SCRIPT\\})', 'optional', false).test(command)) return { kind: 'any' }
  const roots = [...new Set([...command.matchAll(executedPattern(`(${ROOT})/cleanup\\.sh`, 'optional', false))].map((match) => match[1]))]
  return roots.length ? { kind: 'roots', roots } : null
}

// The last CF_SLUG line wins: cf-pi-worktree.sh appends a collision-bumped one.
export function slugOf(envSh: string | null): string | null {
  const lines = (envSh ?? '').split('\n').filter((line) => line.startsWith('CF_SLUG='))
  const value = lines.at(-1)?.slice('CF_SLUG='.length).trim().replace(/^"(.*)"$/, '$1')
  return value ? value : null
}

const parse = (text: string | null): any => {
  if (text === null) return null
  try {
    const value = JSON.parse(text)
    return value !== null && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

export function shardIdsOf(shardsJson: string | null): string[] {
  const groups = parse(shardsJson)?.groups
  return groups !== null && typeof groups === 'object' ? Object.keys(groups) : []
}

const isPass = (outcome: string | null): boolean => {
  const lines = (outcome ?? '').split('\n')
  const at = lines.findIndex((line) => line.trim() === '## Status')
  return at >= 0 && lines[at + 1] === 'PASS'
}

// The retry cap of cf.md's Loop Budget; a change there is a change here.
const RETRY_CAP = 4

type FiguresInput = {
  shardsJson: string | null
  outcomes: Record<string, string | null>
  dispatchStateJson: string | null
  loopBudgetJson: string | null
}

export function implementFiguresOf(input: FiguresInput): ImplementFiguresResult {
  const shardsFile = parse(input.shardsJson)
  const retries = parse(input.loopBudgetJson)?.retries_used
  const retriesLeft = typeof retries === 'number' ? Math.max(0, RETRY_CAP - retries) : null
  if (!shardsFile) return { shards: null, round: null, retriesLeft }
  const ids = shardIdsOf(input.shardsJson)
  const outcomeOf = (id: string) => Object.hasOwn(input.outcomes, id) ? (input.outcomes[id] ?? null) : null
  const currentRound = parse(input.dispatchStateJson)?.current_round
  const running = ids.some((id) => outcomeOf(id) === null)
  return {
    shards: { passed: ids.filter((id) => isPass(outcomeOf(id))).length, total: typeof shardsFile.fan_out_count === 'number' ? shardsFile.fan_out_count : ids.length },
    round: Math.max(1, (typeof currentRound === 'number' ? currentRound : 0) + (running ? 1 : 0)),
    retriesLeft,
  }
}
