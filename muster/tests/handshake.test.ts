import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { openChannel, type Channel } from "../src/channel";
import { HandshakeError, handshake, handshakeTimeoutMs } from "../src/handshake";

const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const RUNS = join(import.meta.dir, "..", ".test-runs");
const WORKTREE = "/tmp/worktree-under-test";
const ADAPTER_RESULTS = {
  initialize: { agentInfo: { name: "claude-agent-acp", version: "0.93.0" } },
};

let dir: string;
let channels: Channel[] = [];
let savedTimeout: string | undefined;

beforeEach(() => {
  mkdirSync(RUNS, { recursive: true });
  dir = mkdtempSync(join(RUNS, "handshake-"));
  savedTimeout = process.env.MUSTER_HANDSHAKE_TIMEOUT_MS;
  delete process.env.MUSTER_HANDSHAKE_TIMEOUT_MS;
});

afterEach(async () => {
  for (const c of channels) await c.close();
  channels = [];
  rmSync(dir, { recursive: true, force: true });
  if (savedTimeout === undefined) delete process.env.MUSTER_HANDSHAKE_TIMEOUT_MS;
  else process.env.MUSTER_HANDSHAKE_TIMEOUT_MS = savedTimeout;
});

async function open(scenario: object = { results: ADAPTER_RESULTS }) {
  const eventsPath = join(dir, "events.jsonl");
  const ch = await openChannel({
    argv: [process.execPath, FAKE],
    env: { FAKE_AGENT_SCENARIO: JSON.stringify(scenario) },
    eventsPath,
    stderrPath: join(dir, "stderr.log"),
  });
  channels.push(ch);
  return { ch, eventsPath };
}

function outMessages(path: string) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; msg: any })
    .filter((e) => e.dir === "out")
    .map((e) => e.msg);
}

describe("SessionHandshake", () => {
  test("T1: session/new is sent with cwd, empty mcpServers and settingSources []", async () => {
    const { ch, eventsPath } = await open();
    await handshake(ch, { worktree: WORKTREE });
    const sessionNew = outMessages(eventsPath).find((m) => m.method === "session/new");
    expect(sessionNew.params).toStrictEqual({
      cwd: WORKTREE,
      mcpServers: [],
      _meta: { claudeCode: { options: { settingSources: [] } } },
    });
  });

  test("T2: initialize is sent with protocolVersion 1 and fs/terminal capabilities off", async () => {
    const { ch, eventsPath } = await open();
    await handshake(ch, { worktree: WORKTREE });
    const init = outMessages(eventsPath).find((m) => m.method === "initialize");
    expect(init.params).toStrictEqual({
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    });
  });

  test("T3: a JSON-RPC error on session/new rejects with HandshakeError and no session/prompt is sent", async () => {
    const { ch, eventsPath } = await open({
      results: ADAPTER_RESULTS,
      errors: { "session/new": "no auth" },
    });
    const err = await handshake(ch, { worktree: WORKTREE }).catch((e) => e);
    expect(err).toBeInstanceOf(HandshakeError);
    expect(err.message).toContain("no auth");
    expect(outMessages(eventsPath).some((m) => m.method === "session/prompt")).toBe(false);
  });

  test("T4: an unanswered request times out with HandshakeError within 2 s", async () => {
    process.env.MUSTER_HANDSHAKE_TIMEOUT_MS = "200";
    const { ch } = await open({ results: ADAPTER_RESULTS, silent: ["initialize"] });
    const started = Date.now();
    const err = await handshake(ch, { worktree: WORKTREE }).catch((e) => e);
    expect(err).toBeInstanceOf(HandshakeError);
    expect(err.message).toContain("timeout");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test("T5: with MUSTER_HANDSHAKE_TIMEOUT_MS unset the timeout is 60000 ms", () => {
    expect(handshakeTimeoutMs()).toBe(60000);
  });
});
