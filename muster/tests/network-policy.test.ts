import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openChannel, type Channel } from "../src/channel";
import { createPermissionHandler } from "../src/escalation";
import { createRunDir, readPhase, runPaths, type RunPaths } from "../src/layout";
import { decideNetwork, type NetworkDecision } from "../src/network-policy";
import { resolveAllowedHosts, sandboxOption } from "../src/sandbox";

const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const SCRIPT = join(import.meta.dir, "support", "scenarios", "permission-turn.ts");
const RUNS = join(import.meta.dir, "..", ".test-runs");
const DEFAULT_HOSTS = ["registry.npmjs.org"];

let home: string;
let channels: Channel[] = [];

beforeEach(() => {
  mkdirSync(RUNS, { recursive: true });
  home = mkdtempSync(join(RUNS, "network-"));
});

afterEach(async () => {
  for (const c of channels) await c.close();
  channels = [];
  rmSync(home, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await sleep(10);
  return check();
}

function events(path: string) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { t: string; dir: string; msg: any });
}

function outReplyFor(path: string, id: string | number) {
  return events(path).find((e) => e.dir === "out" && e.msg.id === id)?.msg;
}

function decisions(path: string) {
  return events(path)
    .filter((e) => e.dir === "client-decision")
    .map((e) => e.msg);
}

const ONCE = [
  { optionId: "allow-once", kind: "allow_once", name: "Allow once" },
  { optionId: "reject-once", kind: "reject_once", name: "Reject once" },
];

const fetchCall = (url: string) => ({ kind: "fetch", toolCallId: "f", title: "Fetch", rawInput: { url, prompt: "x" } });
const hostCall = (host: string) => ({ kind: "other", toolCallId: "h", title: host, rawInput: { host } });

async function setup(scenario: object = {}, name = "run-1", allowedHosts?: string[]) {
  const layout: RunPaths = runPaths(name, { MUSTER_HOME: home, HOME: home });
  createRunDir(layout);
  mkdirSync(layout.worktree, { recursive: true });
  const worktreeReal = realpathSync(layout.worktree);
  const terminate = () => Promise.resolve(1);
  const ch = await openChannel({
    argv: [process.execPath, FAKE],
    env: { FAKE_AGENT_SCENARIO: JSON.stringify(scenario), FAKE_AGENT_SCRIPT: SCRIPT },
    eventsPath: layout.events,
    stderrPath: layout.stderrLog,
  });
  channels.push(ch);
  ch.onRequest(
    "session/request_permission",
    createPermissionHandler({
      layout,
      worktreeReal,
      trackPending: () => () => {},
      terminate,
      logDecision: (m) => ch.logDecision(m),
      env: { MUSTER_POLL_MS: "20", MUSTER_QUESTION_TIMEOUT_MS: "60000" },
      allowedHosts,
    }),
  );
  return { ch, layout };
}

// Runs one prompt through the handler and reports the reply plus the decisions logged.
async function viaHandler(toolCall: object, extra: { options?: object[]; writeOnAllow?: object; allowedHosts?: string[] } = {}, name = "run-h") {
  const { ch, layout } = await setup({ permission: { toolCall, options: extra.options }, writeOnAllow: extra.writeOnAllow }, name, extra.allowedHosts);
  await ch.request("session/prompt", { sessionId: "sess-1" });
  return {
    layout,
    reply: outReplyFor(layout.events, "perm-1")?.result?.outcome,
    decisions: decisions(layout.events),
    questionExists: existsSync(layout.question(1)),
  };
}

describe("NetworkPolicy", () => {
  test("T1: a non-fetch host request is denied with the host and a reason", () => {
    const d = decideNetwork(hostCall("evil.example"), DEFAULT_HOSTS);
    expect(d).toEqual({ decision: "deny", host: "evil.example", reason: expect.any(String) });
  });

  test("T2: a host request through the handler is rejected by policy with no QUESTION file", async () => {
    const target = join(home, "evil-host.txt");
    const { ch, layout } = await setup({ permission: { toolCall: hostCall("evil.example") }, writeOnAllow: { path: target, content: "x" } }, "run-t2");
    await ch.request("session/prompt", { sessionId: "sess-1" });
    expect(existsSync(layout.question(1))).toBe(false);
    expect(readPhase(layout)?.phase).not.toBe("question");
    expect(outReplyFor(layout.events, "perm-1").result.outcome).toEqual({ outcome: "selected", optionId: "reject-once" });
    expect(decisions(layout.events)).toEqual([{ decision: "deny", by: "policy", host: "evil.example" }]);
    expect(existsSync(target)).toBe(false);
  });

  test("T3: a fetch of an allowed host is allowed once by policy with no QUESTION file", async () => {
    const target = join(home, "npm.txt");
    const { ch, layout } = await setup({ permission: { toolCall: fetchCall("https://registry.npmjs.org/left-pad") }, writeOnAllow: { path: target, content: "x" } }, "run-t3");
    await ch.request("session/prompt", { sessionId: "sess-1" });
    expect(existsSync(layout.question(1))).toBe(false);
    expect(outReplyFor(layout.events, "perm-1").result.outcome).toEqual({ outcome: "selected", optionId: "allow-once" });
    expect(decisions(layout.events)).toEqual([{ decision: "allow", by: "policy", host: "registry.npmjs.org" }]);
    expect(existsSync(target)).toBe(true);
  });

  test("T4: a fetch of a host off the list is denied and one of registry.npmjs.org is allowed", async () => {
    expect(decideNetwork(fetchCall("https://example.com/"), DEFAULT_HOSTS)).toMatchObject({ decision: "deny", host: "example.com" });
    expect(decideNetwork(fetchCall("http://registry.npmjs.org/x"), DEFAULT_HOSTS)).toMatchObject({ decision: "allow", host: "registry.npmjs.org" });

    const target = join(home, "denied-fetch.txt");
    const { ch, layout } = await setup({ permission: { toolCall: fetchCall("https://example.com/") }, writeOnAllow: { path: target, content: "x" } }, "run-t4");
    await ch.request("session/prompt", { sessionId: "sess-1" });
    expect(existsSync(layout.question(1))).toBe(false);
    expect(existsSync(target)).toBe(false);
  });

  test("T5: bypass-shaped fetch urls are denied, and an upper-case registry host is allowed", async () => {
    const bypass = [
      "https://registry.npmjs.org@evil.example/",
      "https://evil.example/?u=registry.npmjs.org",
      "https://registry.npmjs.org.evil.example/",
      "https://registry.npmjs.org./",
      "ftp://registry.npmjs.org/",
      "not a url",
      "",
      "https://127.0.0.1/",
      "https://evil.example\\@registry.npmjs.org/",
    ];
    for (const url of bypass) expect(decideNetwork(fetchCall(url), DEFAULT_HOSTS)?.decision).toBe("deny");
    expect(decideNetwork({ kind: "fetch", rawInput: {} }, DEFAULT_HOSTS)?.decision).toBe("deny");
    expect(decideNetwork({ kind: "fetch" }, DEFAULT_HOSTS)?.decision).toBe("deny");
    expect(decideNetwork(fetchCall("https://REGISTRY.NPMJS.ORG/x"), DEFAULT_HOSTS)).toMatchObject({ decision: "allow", host: "registry.npmjs.org" });

    for (const [i, url] of [...bypass, "https://REGISTRY.NPMJS.ORG/x"].entries()) {
      const r = await viaHandler(fetchCall(url), {}, `run-t5-${i}`);
      expect(r.questionExists).toBe(false);
      expect(r.reply).toEqual(url === "https://REGISTRY.NPMJS.ORG/x" ? { outcome: "selected", optionId: "allow-once" } : { outcome: "selected", optionId: "reject-once" });
    }
  });

  test("T6: every web search is denied through the handler with no QUESTION file", async () => {
    const searches = [{ kind: "fetch", rawInput: { query: "bun test docs" } }, { kind: "fetch", rawInput: { query: "x", url: "https://registry.npmjs.org/" } }];
    for (const [i, call] of searches.entries()) {
      const r = await viaHandler(call, {}, `run-t6-${i}`);
      expect(r.questionExists).toBe(false);
      expect(r.reply).toEqual({ outcome: "selected", optionId: "reject-once" });
    }
  });

  test("T7: the list comes from MUSTER_ALLOW_HOSTS and matches the sandbox allowedDomains", async () => {
    const env = { MUSTER_ALLOW_HOSTS: "*.corp.example,docs.example.org" };
    const hosts = resolveAllowedHosts(env);
    expect(
      ["https://a.corp.example/x", "https://corp.example/", "https://docs.example.org/", "https://evil.corp.example.net/"].map(
        (url) => decideNetwork(fetchCall(url), hosts)?.decision,
      ),
    ).toEqual(["allow", "deny", "allow", "deny"]);
    expect(sandboxOption({ worktree: "/t/w", env, tempRoots: [] }).network.allowedDomains).toEqual(hosts);

    const previous = process.env.MUSTER_ALLOW_HOSTS;
    process.env.MUSTER_ALLOW_HOSTS = env.MUSTER_ALLOW_HOSTS;
    try {
      const r = await viaHandler(fetchCall("https://docs.example.org/"), {}, "run-t7");
      expect(r.reply).toEqual({ outcome: "selected", optionId: "allow-once" });
      expect(r.decisions).toEqual([{ decision: "allow", by: "policy", host: "docs.example.org" }]);
    } finally {
      if (previous === undefined) delete process.env.MUSTER_ALLOW_HOSTS;
      else process.env.MUSTER_ALLOW_HOSTS = previous;
    }
  });

  test("T8: non-network shapes are not decided and each writes a QUESTION file", async () => {
    const shapes: object[] = [
      { kind: "other", rawInput: { host: "x.org", file_path: "/etc/passwd" } },
      { kind: "other", rawInput: { host: "" } },
      { kind: "other", rawInput: { host: 42 } },
      { kind: "other" },
      { kind: "think" },
      { kind: "switch_mode" },
    ];
    for (const shape of shapes) expect(decideNetwork(shape as any, DEFAULT_HOSTS)).toBeUndefined();

    for (const [i, shape] of shapes.entries()) {
      const { ch, layout } = await setup({ permission: { toolCall: shape } }, `run-t8-${i}`);
      const turn = ch.request("session/prompt", { sessionId: "sess-1" });
      expect(await waitFor(() => existsSync(layout.question(1)))).toBe(true);
      writeFileSync(layout.answer(1), JSON.stringify({ decision: "deny" }));
      await turn;
    }
  });

  test("R1: an execute request is not a network request and BashPolicy allows it once with no QUESTION file", async () => {
    const call = { kind: "execute", toolCallId: "e", title: "Bash", rawInput: { command: "git status" } };
    expect(decideNetwork(call, DEFAULT_HOSTS)).toBeUndefined();
    const r = await viaHandler(call, {}, "run-r1");
    expect(r.questionExists).toBe(false);
    expect(r.reply).toEqual({ outcome: "selected", optionId: "allow-once" });
  });

  test("T9: a denial with only an allow option, or an allow with only a reject option, replies cancelled", async () => {
    const denied = await viaHandler(hostCall("evil.example"), { options: [ONCE[0]] }, "run-t9a");
    expect(denied.reply).toEqual({ outcome: "cancelled" });
    expect(denied.questionExists).toBe(false);

    const allowed = await viaHandler(fetchCall("https://registry.npmjs.org/"), { options: [ONCE[1]] }, "run-t9b");
    expect(allowed.reply).toEqual({ outcome: "cancelled" });
    expect(allowed.questionExists).toBe(false);
  });

  test("T10: the client-decision line carries the host only, never the path or query", async () => {
    const r = await viaHandler(fetchCall("https://evil.example/path?token=SECRET123"), {}, "run-t10");
    const lines = JSON.stringify(events(r.layout.events).filter((e) => e.dir === "client-decision"));
    expect(lines).toContain("evil.example");
    expect(lines).not.toContain("SECRET123");
    expect(lines).not.toContain("/path");
  });

  test("R2: a fetch whose rawInput is a primitive is denied without throwing", () => {
    for (const raw of ["https://example.com/", 42, true]) {
      expect(decideNetwork({ kind: "fetch", rawInput: raw }, DEFAULT_HOSTS)?.decision).toBe("deny");
    }
  });

  test("T11: the table catches a guard that always returns undefined and one that always allows", () => {
    const table: Array<[object, string | undefined]> = [
      [hostCall("evil.example"), "deny"],
      [fetchCall("https://registry.npmjs.org/x"), "allow"],
      [{ kind: "other", rawInput: { host: "x.org", file_path: "/etc/passwd" } }, undefined],
    ];
    const failures = (decide: (c: any, h: string[]) => NetworkDecision | undefined) =>
      table.filter(([call, want]) => decide(call as any, DEFAULT_HOSTS)?.decision !== want).length;
    expect(failures(decideNetwork)).toBe(0);
    expect(failures(() => undefined)).toBeGreaterThan(0);
    expect(failures(() => ({ decision: "allow", reason: "" }))).toBeGreaterThan(0);
  });
});
