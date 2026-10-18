export type BashContext = { worktreeReal?: string };

type BashDecision = { allow: true; reason: string } | { allow: false; reason: string };

const ALLOW_REASON = "bash runs inside the OS sandbox";
const DENY_REASON = "bash is confined by the OS sandbox; a request that reaches the client is escalated";

export function decideBash(command: unknown, _ctx?: BashContext): BashDecision {
  if (typeof command === "string" && command.length > 0) return { allow: true, reason: ALLOW_REASON };
  return { allow: false, reason: DENY_REASON };
}
