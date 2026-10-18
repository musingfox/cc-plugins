import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { openChannel, type Channel } from "../src/channel";
import { HandshakeError, handshake, handshakeTimeoutMs } from "../src/handshake";
import { resolveAllowedHosts } from "../src/sandbox";

const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const RUNS = join(import.meta.dir, "..", ".test-runs");
const WORKTREE = "/tmp/worktree-under-test";
const ADAPTER_RESULTS = {
  initialize: { agentInfo: { name: "claude-agent-acp", version: "0.93.0" } },
};
const DEFAULT_HOSTS = ["registry.npmjs.org", "github.com", "codeload.github.com"];
const T1_PARAMS = {
  cwd: "/w/x",
  mcpServers: [],
  _meta: {
    claudeCode: {
      options: {
        settingSources: [],
        sandbox: {
          enabled: true,
          failIfUnavailable: true,
          autoAllowBashIfSandboxed: true,
          allowUnsandboxedCommands: false,
          network: { allowedDomains: DEFAULT_HOSTS, strictAllowlist: true },
        },
      },
    },
  },
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

function sentMethods(path: string): string[] {
  return existsSync(path) ? outMessages(path).map((m) => m.method) : [];
}

function sessionNew(path: string) {
  return outMessages(path).find((m) => m.method === "session/new")?.params;
}

describe("SessionHandshake", () => {
  test("T1: session/new is sent with cwd, empty mcpServers, settingSources [] and the sandbox option", async () => {
    const { ch, eventsPath } = await open();
    await handshake(ch, { worktree: "/w/x", env: {} });
    expect(sessionNew(eventsPath)).toStrictEqual(T1_PARAMS);
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

  test("T6: MUSTER_ALLOW_HOSTS is trimmed, lower-cased, deduplicated and appended after the defaults", async () => {
    const { ch, eventsPath } = await open();
    await handshake(ch, {
      worktree: "/w/x",
      env: { MUSTER_ALLOW_HOSTS: " Example.org, *.corp.example ,github.com," },
    });
    expect(sessionNew(eventsPath)._meta.claudeCode.options.sandbox.network.allowedDomains).toStrictEqual([
      ...DEFAULT_HOSTS,
      "example.org",
      "*.corp.example",
    ]);
  });

  test("T7: an invalid MUSTER_ALLOW_HOSTS entry rejects with invalid-allow-host before any request is sent", async () => {
    for (const entry of ["https://x.org", "a.com/path", "a.com:443", "*", "localhost", "a b"]) {
      const { ch, eventsPath } = await open();
      const err = await handshake(ch, { worktree: "/w/x", env: { MUSTER_ALLOW_HOSTS: entry } }).catch((e) => e);
      expect(err).toBeInstanceOf(HandshakeError);
      expect(err.message).toContain("invalid-allow-host");
      expect(err.message).toContain(entry);
      expect(sentMethods(eventsPath)).not.toContain("initialize");
      expect(sentMethods(eventsPath)).not.toContain("session/new");
    }
  });

  test("R2: session/new sandbox has no filesystem key and no denyWrite or allowWrite, for any worktree", async () => {
    const { ch, eventsPath } = await open();
    await handshake(ch, { worktree: "/t/a/runs/w", env: {} });
    const sandbox = sessionNew(eventsPath)._meta.claudeCode.options.sandbox;
    expect(sandbox).not.toHaveProperty("filesystem");
    expect(JSON.stringify(sandbox)).not.toMatch(/denyWrite|allowWrite/);
  });

  test("T10: no environment variable switches the sandbox off or allows unsandboxed commands", async () => {
    const { ch, eventsPath } = await open();
    await handshake(ch, {
      worktree: "/w/x",
      env: { MUSTER_SANDBOX: "off", MUSTER_ALLOW_UNSANDBOXED: "1", MUSTER_ALLOW_HOSTS: "" },
    });
    expect(sessionNew(eventsPath)).toStrictEqual(T1_PARAMS);
  });

  test("T11: the sandbox allowedDomains equal resolveAllowedHosts for the same env", async () => {
    const env = { MUSTER_ALLOW_HOSTS: "a.org" };
    const { ch, eventsPath } = await open();
    await handshake(ch, { worktree: "/w/x", env });
    expect(sessionNew(eventsPath)._meta.claudeCode.options.sandbox.network.allowedDomains).toStrictEqual([
      ...DEFAULT_HOSTS,
      "a.org",
    ]);
    expect(resolveAllowedHosts(env)).toStrictEqual([...DEFAULT_HOSTS, "a.org"]);
  });
});
