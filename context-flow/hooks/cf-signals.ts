import type { FlowPhase, ImplementFiguresResult } from '../types/index.d.ts'

const ROOT = '/tmp/cf-\\d{4}-[A-Za-z0-9]{4}'

// cf-pi-setup.sh prints the session path alone on stdout; cf.md echoes it again as SESSION=<root>.
export function sessionRootOf(stdout: string): string | null {
  return stdout.match(new RegExp(`^SESSION=(${ROOT})$`, 'm'))?.[1] ?? null
}

// Every cf Bash after setup starts with `. "<root>/env.sh"`; a shard's env.sh sits one level deeper and does not match.
export function sourcedRootOf(command: string): string | null {
  const found = [...command.matchAll(new RegExp(`(?:^|[\\s;&|(])(?:\\.|source)\\s+"?(${ROOT})/env\\.sh"?`, 'g'))]
  return found.at(-1)?.[1] ?? null
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

export const isImplementCommand = (command: string): boolean => /\bcf-pi-(?:worktree|shard|run)\.sh\b/.test(command)

// 'any' when the command runs whatever env.sh's CLEANUP_SCRIPT names; else the root of a literal <root>/cleanup.sh.
export function cleanupTargetOf(command: string): 'any' | string | null {
  if (command.includes('CLEANUP_SCRIPT')) return 'any'
  return command.match(new RegExp(`(${ROOT})/cleanup\\.sh`))?.[1] ?? null
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

const isPass = (outcome: string | null): boolean => {
  const lines = (outcome ?? '').split('\n')
  const at = lines.findIndex((line) => line.trim() === '## Status')
  return at >= 0 && lines[at + 1]?.trim() === 'PASS'
}

export function implementFiguresOf(input: {
  shardsJson: string | null
  outcomes: Record<string, string | null>
  dispatchStateJson: string | null
  loopBudgetJson: string | null
}): ImplementFiguresResult {
  const shardsFile = parse(input.shardsJson)
  const retries = parse(input.loopBudgetJson)?.retries_used
  const retriesLeft = typeof retries === 'number' ? Math.max(0, 4 - retries) : null
  if (!shardsFile) return { shards: null, round: null, retriesLeft }
  const ids = Object.keys(shardsFile.groups ?? {})
  const outcomeOf = (id: string) => input.outcomes[id] ?? null
  const currentRound = parse(input.dispatchStateJson)?.current_round
  const running = ids.some((id) => outcomeOf(id) === null)
  return {
    shards: { passed: ids.filter((id) => isPass(outcomeOf(id))).length, total: typeof shardsFile.fan_out_count === 'number' ? shardsFile.fan_out_count : ids.length },
    round: Math.max(1, (typeof currentRound === 'number' ? currentRound : 0) + (running ? 1 : 0)),
    retriesLeft,
  }
}
