export const ADAPTER_VERSION = "0.93.0";
export const ADAPTER_SPEC = `@agentclientprotocol/claude-agent-acp@${ADAPTER_VERSION}`;

const ENV_ALLOWLIST = new Set(["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TERM", "LANG", "TZ"]);

export class UsageError extends Error {
  override name = "UsageError";
}

export function isExactPin(spec: string): boolean {
  return /^(?:@[^/]+\/)?[^@/]+@\d+\.\d+\.\d+$/.test(spec);
}

export function buildAgentLaunch(env: Record<string, string | undefined>): {
  argv: string[];
  env: Record<string, string>;
} {
  const argv = parseAgentCmd(env.MUSTER_AGENT_CMD) ?? ["bunx", ADAPTER_SPEC];
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || !(ENV_ALLOWLIST.has(key) || key.startsWith("LC_"))) continue;
    out[key] = value;
  }
  out.CLAUDE_CODE_DISABLE_ADVISOR_TOOL = "1";
  return { argv, env: out };
}

function parseAgentCmd(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError("MUSTER_AGENT_CMD must be a JSON array of strings");
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((v) => typeof v === "string")) {
    throw new UsageError("MUSTER_AGENT_CMD must be a non-empty JSON array of strings");
  }
  return parsed as string[];
}
