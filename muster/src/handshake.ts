import type { Channel } from "./channel";

export class HandshakeError extends Error {
  override name = "HandshakeError";
}

export type AgentInfo = { name?: string; version?: string };

export type Handshake = {
  sessionId: string;
  configOptions: unknown;
  agentInfo?: AgentInfo;
};

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

export async function handshake(channel: Channel, opts: { worktree: string }): Promise<Handshake> {
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
  const session = (await call(
    channel,
    "session/new",
    {
      cwd: opts.worktree,
      mcpServers: [],
      _meta: { claudeCode: { options: { settingSources: [] } } },
    },
    ms,
  )) as { sessionId: string; configOptions: unknown };
  return { sessionId: session.sessionId, configOptions: session.configOptions, agentInfo: init?.agentInfo };
}
