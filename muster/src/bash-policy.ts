export type BashContext = { worktreeReal?: string; fenced?: boolean };

type BashDecision = { allow: true; reason: string } | { allow: false; reason: string };

const FENCED_ALLOW_REASON = "bash runs inside the OS sandbox";
const UNFENCED_ALLOW_REASON = "bash runs in the worker's worktree without an OS sandbox";
const DENY_REASON = "bash is confined by the OS sandbox; a request that reaches the client is escalated";

export function decideBash(command: unknown, ctx?: BashContext): BashDecision {
  if (typeof command === "string" && command.length > 0) {
    return { allow: true, reason: ctx?.fenced ? FENCED_ALLOW_REASON : UNFENCED_ALLOW_REASON };
  }
  return { allow: false, reason: DENY_REASON };
}
