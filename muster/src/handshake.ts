import type { Channel } from "./channel";
import { installCacheEnv } from "./launch";
import { DEFAULT_ALLOWED_HOSTS, sandboxOption } from "./sandbox";

export class HandshakeError extends Error {
  override name = "HandshakeError";
}

export type AgentInfo = { name?: string; version?: string };

export type Handshake = {
  sessionId: string;
  configOptions: unknown;
  agentInfo?: AgentInfo;
};

export const WORKER_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch", "ToolSearch", "TodoWrite", "TaskCreate", "TaskUpdate", "TaskList"];

export const ADAPTER_VERSION = "0.93.0";

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 60000;

export function assertAdapterVersion(agentInfo: AgentInfo | undefined): void {
  const got = agentInfo?.version;
  if (got !== ADAPTER_VERSION) {
    throw new HandshakeError(`adapter-version-mismatch: expected ${ADAPTER_VERSION} got ${got ?? "none"}`);
  }
}

export function handshakeTimeoutMs(): number {
  const raw = process.env.MUSTER_HANDSHAKE_TIMEOUT_MS;
  return raw === undefined ? DEFAULT_HANDSHAKE_TIMEOUT_MS : Number(raw);
}

async function call(channel: Channel, method: string, params: unknown, ms: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new HandshakeError(`timeout after ${ms}ms waiting for ${method}`)),
      ms,
    );
  });
  try {
    return await Promise.race([channel.request(method, params), timeout]);
  } catch (e) {
    if (e instanceof HandshakeError) throw e;
    throw new HandshakeError(`${method} failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

// resume names the session a previous client opened: the new client resumes it with the options session/new had.
// allowedHosts is the run's recorded list, so a resumed turn gets the hosts of the first, whatever its own env says.
export async function handshake(
  channel: Channel,
  opts: {
    worktree: string;
    cache: string;
    fenced?: boolean;
    resume?: string;
    allowedHosts?: readonly string[];
    env?: Record<string, string | undefined>;
  },
): Promise<Handshake> {
  const env = opts.env ?? process.env;
  const sandbox = opts.fenced
    ? sandboxOption({ env, cache: opts.cache, allowedHosts: opts.allowedHosts ?? DEFAULT_ALLOWED_HOSTS })
    : undefined;
  const ms = handshakeTimeoutMs();
  const init = (await call(
    channel,
    "initialize",
    {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    },
    ms,
  )) as { agentInfo?: AgentInfo } | null;
  assertAdapterVersion(init?.agentInfo);
  const params = {
    cwd: opts.worktree,
    mcpServers: [],
    _meta: {
      claudeCode: {
        options: {
          settingSources: [],
          // Claude Code allows WebFetch to its preapproved documentation hosts without asking, which skips the
          // client's allowlist; an ask rule is checked before that shortcut.
          settings: { permissions: { ask: ["WebFetch"] }, disableClaudeAiConnectors: true },
          // Without an allowlist and with connectors on, the worker inherits the user's account-level tools
          // (RemoteTrigger acted on cloud routines with no permission request).
          tools: WORKER_TOOLS,
          // The adapter starts from the launch cache and the Claude Code child inherits its env; this moves the
          // worker's own installs back to the cache its sandbox may write. The adapter merges env over its own.
          env: installCacheEnv(opts.cache),
          ...(sandbox ? { sandbox } : {}),
        },
      },
    },
  };
  if (opts.resume !== undefined) {
    const resumed = (await call(channel, "session/resume", { sessionId: opts.resume, ...params }, ms)) as {
      configOptions?: unknown;
    } | null;
    return { sessionId: opts.resume, configOptions: resumed?.configOptions, agentInfo: init?.agentInfo };
  }
  const session = (await call(channel, "session/new", params, ms)) as { sessionId: string; configOptions: unknown };
  return { sessionId: session.sessionId, configOptions: session.configOptions, agentInfo: init?.agentInfo };
}
