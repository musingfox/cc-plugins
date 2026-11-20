import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { openChannel, type Channel } from "../src/channel";
import { HandshakeError, handshake, handshakeTimeoutMs } from "../src/handshake";
import { resolveAllowedHosts } from "../src/sandbox";
import { USER_TEMP_WRITES } from "./support/user-temp";

const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const RUNS = join(import.meta.dir, "..", ".test-runs");
const WORKTREE = "/tmp/worktree-under-test";
const ADAPTER_RESULTS = {
  initialize: { agentInfo: { name: "claude-agent-acp", version: "0.93.0" } },
};
const DEFAULT_HOSTS = ["registry.npmjs.org"];
const CREDENTIAL_STORES = [
  ".npmrc",
  ".config/gh",
  ".git-credentials",
  ".config/git/credentials",
  ".netrc",
  ".aws",
  ".docker/config.json",
  "Library/Keychains",
  ".ssh",
  ".pi",
  ".config/gcloud",
  ".kube",
  ".cargo/credentials.toml",
  ".pypirc",
].map((p) => `/home/u/${p}`);
const T1_PARAMS = {
  cwd: "/w/x",
  mcpServers: [],
  _meta: {
    claudeCode: {
      options: {
        settingSources: [],
        settings: { permissions: { ask: ["WebFetch"] }, disableClaudeAiConnectors: true },
        tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch", "ToolSearch", "TodoWrite", "TaskCreate", "TaskUpdate", "TaskList"],
        env: { npm_config_cache: "/tmp/muster-cache/npm", BUN_INSTALL_CACHE_DIR: "/tmp/muster-cache/bun" },
        sandbox: {
          enabled: true,
          failIfUnavailable: true,
          autoAllowBashIfSandboxed: true,
          allowUnsandboxedCommands: false,
          network: { allowedDomains: DEFAULT_HOSTS, strictAllowlist: true },
          filesystem: { denyRead: CREDENTIAL_STORES, allowWrite: ["/tmp/muster-cache", ...USER_TEMP_WRITES] },
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
  test("T1: a fenced session/new is sent with cwd, empty mcpServers, settingSources [], the WebFetch ask rule, connectors off, the tool allowlist, the run cache env and the sandbox option", async () => {
    const { ch, eventsPath } = await open();
    await handshake(ch, { cache: "/tmp/muster-cache", worktree: "/w/x", fenced: true, env: { HOME: "/home/u" } });
    expect(sessionNew(eventsPath)).toStrictEqual(T1_PARAMS);
  });

  test("S1: a resume sends session/resume with the session id and the same params session/new takes, and no session/new", async () => {
    const offered = [{ id: "mode", category: "mode", currentValue: "default" }];
    const { ch, eventsPath } = await open({ results: { ...ADAPTER_RESULTS, "session/new": { sessionId: "unused", configOptions: offered } } });
    const hs = await handshake(ch, { cache: "/tmp/muster-cache", worktree: "/w/x", fenced: true, resume: "sess-old", env: { HOME: "/home/u" } });
    expect(hs.sessionId).toBe("sess-old");
    expect(hs.configOptions).toEqual(offered);
    expect(sentMethods(eventsPath)).toEqual(["initialize", "session/resume"]);
    expect(outMessages(eventsPath)[1].params).toStrictEqual({ sessionId: "sess-old", ...T1_PARAMS });
  });

  test("T2: initialize is sent with protocolVersion 1 and fs/terminal capabilities off", async () => {
    const { ch, eventsPath } = await open();
    await handshake(ch, { cache: "/tmp/muster-cache", worktree: WORKTREE });
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
    const err = await handshake(ch, { cache: "/tmp/muster-cache", worktree: WORKTREE }).catch((e) => e);
    expect(err).toBeInstanceOf(HandshakeError);
    expect(err.message).toContain("no auth");
    expect(outMessages(eventsPath).some((m) => m.method === "session/prompt")).toBe(false);
  });

  test("T4: an unanswered request times out with HandshakeError within 2 s", async () => {
    process.env.MUSTER_HANDSHAKE_TIMEOUT_MS = "200";
    const { ch } = await open({ results: ADAPTER_RESULTS, silent: ["initialize"] });
    const started = Date.now();
    const err = await handshake(ch, { cache: "/tmp/muster-cache", worktree: WORKTREE }).catch((e) => e);
    expect(err).toBeInstanceOf(HandshakeError);
    expect(err.message).toContain("timeout");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test("T5: with MUSTER_HANDSHAKE_TIMEOUT_MS unset the timeout is 60000 ms", () => {
    expect(handshakeTimeoutMs()).toBe(60000);
  });

  test("T6: MUSTER_ALLOW_HOSTS is trimmed, lower-cased, deduplicated and appended after the defaults", () => {
    expect(resolveAllowedHosts({ MUSTER_ALLOW_HOSTS: " Example.org, *.corp.example ,registry.npmjs.org," })).toStrictEqual([
      ...DEFAULT_HOSTS,
      "example.org",
      "*.corp.example",
    ]);
  });

  test("T7: an invalid MUSTER_ALLOW_HOSTS entry is rejected with invalid-allow-host", () => {
    for (const entry of ["https://x.org", "a.com/path", "a.com:443", "*", "localhost", "a b"]) {
      expect(() => resolveAllowedHosts({ MUSTER_ALLOW_HOSTS: entry })).toThrow(`invalid-allow-host: ${entry}`);
    }
  });

  test("R2: session/new sandbox filesystem denies the credential stores and allows writes only to the run cache and the user temp dir, with no denyWrite", async () => {
    const { ch, eventsPath } = await open();
    await handshake(ch, { cache: "/t/a/runs/w/cache", worktree: "/t/a/runs/w/worktree", fenced: true, env: { HOME: "/home/u" } });
    const sandbox = sessionNew(eventsPath)._meta.claudeCode.options.sandbox;
    expect(sandbox.filesystem).toStrictEqual({ denyRead: CREDENTIAL_STORES, allowWrite: ["/t/a/runs/w/cache", ...USER_TEMP_WRITES] });
  });

  test("T10: only the fenced option turns the sandbox on; no environment variable turns it on or off", async () => {
    const fenced = await open();
    await handshake(fenced.ch, {
      cache: "/tmp/muster-cache",
      worktree: "/w/x",
      fenced: true,
      env: { HOME: "/home/u", MUSTER_SANDBOX: "off", MUSTER_ALLOW_UNSANDBOXED: "1", MUSTER_ALLOW_HOSTS: "" },
    });
    expect(sessionNew(fenced.eventsPath)).toStrictEqual(T1_PARAMS);
  });

  test("T10: without fenced no environment variable turns the sandbox on", async () => {
    const { ch, eventsPath } = await open();
    await handshake(ch, { cache: "/tmp/muster-cache", worktree: "/w/x", env: { HOME: "/home/u", MUSTER_SANDBOX: "on", MUSTER_ALLOW_UNSANDBOXED: "0" } });
    expect(sessionNew(eventsPath)._meta.claudeCode.options).not.toHaveProperty("sandbox");
  });

  test("F1: without fenced, session/new equals the fenced params minus the sandbox key and nothing else", async () => {
    const { ch, eventsPath } = await open();
    await handshake(ch, { cache: "/tmp/muster-cache", worktree: "/w/x", fenced: false, env: { HOME: "/home/u" } });
    const { sandbox: _drop, ...options } = T1_PARAMS._meta.claudeCode.options;
    expect(sessionNew(eventsPath)).toStrictEqual({ ...T1_PARAMS, _meta: { claudeCode: { options } } });
  });

  test("T11: the sandbox allowedDomains are the hosts passed in, not MUSTER_ALLOW_HOSTS from the env", async () => {
    const { ch, eventsPath } = await open();
    await handshake(ch, {
      cache: "/tmp/muster-cache",
      worktree: "/w/x",
      fenced: true,
      allowedHosts: [...DEFAULT_HOSTS, "a.org"],
      env: { MUSTER_ALLOW_HOSTS: "b.org" },
    });
    expect(sessionNew(eventsPath)._meta.claudeCode.options.sandbox.network.allowedDomains).toStrictEqual([
      ...DEFAULT_HOSTS,
      "a.org",
    ]);
  });
});
