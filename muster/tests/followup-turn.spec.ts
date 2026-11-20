import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPhase, runPaths, writePhase, type RunPaths } from "../src/layout";
import { runWorker, type DispatchRequest } from "../src/session";
import { readStatus } from "../src/status";
import { followupVerb } from "../src/verbs/followup";
import { git } from "./support/repo";

const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const SCRIPT = join(import.meta.dir, "support", "scenarios", "permission-turn.ts");
const CLI = join(import.meta.dir, "..", "src", "muster.ts");
const OFFERED = ["claude-haiku-5-5", "claude-sonnet-5-5"];

// Repositories and run directories live under the temp directory: runWorker, unlike `muster run`, does not refuse it.
let home: string;
let repo: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "muster-followup-turn-"));
  repo = join(home, "repo");
  mkdirSync(repo);
  git(repo, ["init", "-q"]);
  git(repo, ["config", "core.hooksPath", "/dev/null"]);
  git(repo, ["config", "commit.gpgsign", "false"]);
  git(repo, ["commit", "-q", "--allow-empty", "-m", "first"]);
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await sleep(10);
  return check();
}

function scenario(extra: object = {}) {
  return {
    results: {
      initialize: { agentInfo: { name: "claude-agent-acp", version: "0.93.0" } },
      "session/new": {
        sessionId: "sess-1",
        configOptions: [
          { id: "model", category: "model", currentValue: OFFERED[0], options: OFFERED.map((value) => ({ value, name: value })) },
          { id: "mode", category: "mode", currentValue: "auto", options: [{ value: "default" }, { value: "auto" }] },
        ],
      },
    },
    ...extra,
  };
}

function fakeCmd(sc: object, script = SCRIPT): string {
  return JSON.stringify(["env", `FAKE_AGENT_SCENARIO=${JSON.stringify(sc)}`, `FAKE_AGENT_SCRIPT=${script}`, process.execPath, FAKE]);
}

function agentEnv(sc: object, script = SCRIPT): Record<string, string> {
  return { HOME: home, MUSTER_HOME: home, MUSTER_AGENT_CMD: fakeCmd(sc, script), MUSTER_POLL_MS: "20", MUSTER_KILL_GRACE_MS: "200" };
}

const env = () => ({ MUSTER_HOME: home, HOME: home });

function request(fenced = true): DispatchRequest {
  return { ticket: "Write the hello file", model: "claude-haiku-5-5", repoRoot: repo, baseRef: "HEAD", fenced };
}

function events(path: string): { dir: string; msg: any }[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

const out = (layout: RunPaths, method: string) =>
  events(layout.events).filter((e) => e.dir === "out" && e.msg.method === method).map((e) => e.msg.params);

const outMethods = (layout: RunPaths) =>
  events(layout.events).filter((e) => e.dir === "out" && e.msg.method !== undefined).map((e) => e.msg.method as string);

async function firstTurn(sc: object = scenario({ replies: ["DONE\nfirst"] }), fenced = true): Promise<RunPaths> {
  const layout = runPaths("a1", env());
  await runWorker(request(fenced), layout, { env: agentEnv(sc), exit: () => {} });
  expect(readPhase(layout)?.phase).toBe("exited");
  return layout;
}

describe("FollowUpResumesTheSession", () => {
  test("R1: followup on an exited run resumes the recorded session, prompts, writes the new report and exits", async () => {
    const layout = await firstTurn();
    const exits: number[] = [];
    const r = await followupVerb("a1", "do the second part", env(), {
      env: agentEnv(scenario({ replies: ["DONE\nsecond"] })),
      exit: (c) => exits.push(c),
    });
    expect(r.exitCode).toBe(0);
    expect(exits).toEqual([0]);
    const methods = outMethods(layout);
    const resumeAt = methods.indexOf("session/resume");
    expect(resumeAt).toBeGreaterThan(-1);
    expect(methods.lastIndexOf("session/prompt")).toBeGreaterThan(resumeAt);
    expect(out(layout, "session/resume")[0].sessionId).toBe("sess-1");
    expect(out(layout, "session/prompt").at(-1).prompt[0].text.startsWith("do the second part\n")).toBe(true);
    expect(readFileSync(layout.report, "utf8")).toBe("DONE\nsecond");
    expect(readPhase(layout)).toMatchObject({ phase: "exited", reason: "turn-ended", fetched: true });
    expect(readStatus(layout.runDir).state).toBe("done");
  });

  test("R1b: followup --file sends the file's bytes as the follow-up text", async () => {
    const layout = await firstTurn();
    const file = join(home, "next.md");
    writeFileSync(file, "line one\n\n  indented 中文\n");
    await followupVerb("a1", { file }, env(), { env: agentEnv(scenario()), exit: () => {} });
    expect(out(layout, "session/prompt").at(-1).prompt[0].text.startsWith("line one\n\n  indented 中文\n")).toBe(true);
  });

  test("R2: the resumed session carries the first session's options and passes the model and mode gates again", async () => {
    const layout = await firstTurn();
    await followupVerb("a1", "next", env(), { env: agentEnv(scenario()), exit: () => {} });
    const created = out(layout, "session/new")[0];
    const resumed = out(layout, "session/resume")[0];
    expect(resumed.cwd).toBe(created.cwd);
    expect(resumed._meta).toEqual(created._meta);
    expect(resumed._meta.claudeCode.options).toHaveProperty("sandbox");
    const gates = out(layout, "session/set_config_option").slice(2);
    expect(gates).toEqual([
      { sessionId: "sess-1", configId: "model", value: "claude-haiku-5-5" },
      { sessionId: "sess-1", configId: "mode", value: "default" },
    ]);
  });

  test("R3: an --unfenced run resumes without a sandbox", async () => {
    const layout = await firstTurn(scenario(), false);
    expect(JSON.parse(readFileSync(layout.meta, "utf8")).fenced).toBe(false);
    await followupVerb("a1", "next", env(), { env: agentEnv(scenario()), exit: () => {} });
    expect(out(layout, "session/resume")[0]._meta.claudeCode.options).not.toHaveProperty("sandbox");
  });

  test("R4: a model the resumed session does not offer blocks the follow-up before its prompt", async () => {
    const layout = await firstTurn();
    const exits: number[] = [];
    const sc = scenario();
    sc.results["session/new"].configOptions[0].options = [{ value: "claude-sonnet-5-5", name: "claude-sonnet-5-5" }];
    await followupVerb("a1", "next", env(), { env: agentEnv(sc), exit: (c) => exits.push(c) });
    expect(exits).toEqual([1]);
    expect(out(layout, "session/prompt")).toHaveLength(1);
    expect(readFileSync(layout.report, "utf8")).toContain("handshake-failed");
  });

  test("R5: plan and tools accumulate across turns, cost is the resumed session's total, and models lists every model seen", async () => {
    const first = [
      { sessionUpdate: "plan", entries: [{ content: "a", status: "completed" }, { content: "b", status: "pending" }] },
      { sessionUpdate: "tool_call", toolCallId: "t1" },
      { sessionUpdate: "usage_update", cost: { amount: 0.5, currency: "USD" } },
    ];
    const layout = await firstTurn(scenario({ updates: first, modelUsage: [{ model: "claude-haiku-5-5" }] }));
    expect(readPhase(layout)).toMatchObject({ tools: 1, cost: 0.5, plan: { done: 1, total: 2 } });
    const second = [
      { sessionUpdate: "tool_call", toolCallId: "t2" },
      { sessionUpdate: "tool_call", toolCallId: "t3" },
      { sessionUpdate: "usage_update", cost: { amount: 0.75, currency: "USD" } },
    ];
    await followupVerb("a1", "next", env(), {
      env: agentEnv(scenario({ updates: second, modelUsage: [{ model: "claude-sonnet-5-5" }] })),
      exit: () => {},
    });
    expect(readPhase(layout)).toMatchObject({ tools: 3, cost: 0.75, plan: { done: 1, total: 2 }, title: "Write the hello file" });
    expect(readPhase(layout)?.models).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
  });

  test("R6: a follow-up's question takes the next free number and the run waits on it", async () => {
    const layout = await firstTurn();
    writeFileSync(layout.question(1), JSON.stringify({ n: 1, paths: [] }));
    writeFileSync(layout.answer(1), JSON.stringify({ decision: "allow" }));
    const outside = join(home, "outside.txt");
    const sc = scenario({
      permission: { toolCall: { toolCallId: "t-w", kind: "edit", title: "Write", locations: [{ path: outside }], rawInput: { file_path: outside, content: "x" } } },
      writeOnAllow: { path: outside, content: "x" },
      replies: ["DONE\nwrote it"],
    });
    const run = followupVerb("a1", "write outside", env(), { env: agentEnv(sc), exit: () => {} });
    expect(await waitFor(() => existsSync(layout.question(2)))).toBe(true);
    expect(readStatus(layout.runDir)).toMatchObject({ state: "question", question: 2 });
    writeFileSync(layout.answer(2), JSON.stringify({ decision: "allow" }));
    await run;
    expect(readFileSync(outside, "utf8")).toBe("x");
    expect(readStatus(layout.runDir).state).toBe("done");
  });

  test("R7: a STOP and an unanswered question left by a stopped turn do not end or block the follow-up", async () => {
    const layout = await firstTurn();
    writeFileSync(layout.stop, "");
    writeFileSync(layout.question(1), JSON.stringify({ n: 1, paths: [] }));
    writePhase(layout, { reason: "stopped" });
    await followupVerb("a1", "carry on", env(), { env: agentEnv(scenario({ replies: ["DONE\ncarried on"] })), exit: () => {} });
    expect(readFileSync(layout.report, "utf8")).toBe("DONE\ncarried on");
    expect(readPhase(layout)?.reason).toBe("turn-ended");
    expect(readStatus(layout.runDir).state).toBe("done");
  });

  test("R8: a stop during a follow-up turn ends BLOCKED, not with the previous turn's DONE", async () => {
    const layout = await firstTurn();
    const exits: number[] = [];
    const run = followupVerb("a1", "slow", env(), {
      env: { ...agentEnv(scenario({ replies: ["DONE\nlate"], promptDelayMs: 2000 })), MUSTER_KILL_GRACE_MS: "300" },
      exit: (c) => exits.push(c),
    });
    expect(await waitFor(() => out(layout, "session/prompt").length === 2)).toBe(true);
    expect(existsSync(layout.report)).toBe(false);
    writeFileSync(layout.stop, "");
    await run;
    expect(exits).toEqual([0]);
    expect(readFileSync(layout.report, "utf8")).toBe("BLOCKED\nreason: stopped\n");
    expect(readPhase(layout)?.reason).toBe("stopped");
  });

  test("R9: the agent exiting during a follow-up turn blocks the run with agent-exited", async () => {
    const layout = await firstTurn();
    const exits: number[] = [];
    await followupVerb("a1", "crash", env(), {
      env: agentEnv(scenario({ termination: { exitOnMethod: { "session/prompt": 3 } } })),
      exit: (c) => exits.push(c),
    });
    expect(exits).toEqual([1]);
    expect(readFileSync(layout.report, "utf8").split("\n")[1]).toContain("agent-exited");
  });

  test("R10: a commit made during a follow-up turn is fetched back before the run reads as done", async () => {
    const layout = await firstTurn();
    const run = followupVerb("a1", "commit", env(), {
      env: agentEnv(scenario({ replies: ["DONE\ncommitted"], promptDelayMs: 300 })),
      exit: () => {},
    });
    expect(await waitFor(() => out(layout, "session/prompt").length === 2)).toBe(true);
    writeFileSync(join(layout.worktree, "late.txt"), "x\n");
    git(layout.worktree, ["add", "late.txt"]);
    git(layout.worktree, ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "late"]);
    const sha = git(layout.worktree, ["rev-parse", "HEAD"]);
    await run;
    expect(git(repo, ["rev-parse", "muster/a1"])).toBe(sha);
    expect(readStatus(layout.runDir)).toMatchObject({ state: "done", head: sha });
  });
});

describe("FollowUpRefusals", () => {
  test("X1: a follow-up while the client is still running is refused with exit 1 and starts nothing", async () => {
    const layout = await firstTurn();
    writePhase(layout, { phase: "running", pid: process.pid });
    const before = outMethods(layout).length;
    const r = await followupVerb("a1", "too soon", env(), { env: agentEnv(scenario()), exit: () => {} });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("still running");
    expect(outMethods(layout)).toHaveLength(before);
    expect(readPhase(layout)).toMatchObject({ phase: "running", pid: process.pid });
    expect(readFileSync(layout.report, "utf8")).toBe("DONE\nfirst");
  });

  test("X2: a run with no recorded session is refused with exit 1", async () => {
    const layout = await firstTurn();
    writePhase(layout, { sessionId: undefined });
    const r = await followupVerb("a1", "next", env(), { env: agentEnv(scenario()), exit: () => {} });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("no session");
    expect(outMethods(layout)).not.toContain("session/resume");
  });

  test("X3: two concurrent followups start at most one client", async () => {
    const layout = await firstTurn();
    const childEnv = { ...process.env, ...agentEnv(scenario({ replies: ["DONE\nonce"], promptDelayMs: 500 })) };
    const spawn = (text: string) =>
      Bun.spawn(["bun", CLI, "followup", "a1", text], { env: childEnv, stdout: "pipe", stderr: "pipe" });
    const procs = [spawn("one"), spawn("two")];
    const codes = await Promise.all(procs.map((p) => p.exited));
    expect([...codes].sort()).toEqual([0, 1]);
    const refused = procs[codes.indexOf(1)];
    expect(await new Response(refused.stderr).text()).toContain("still running");
    expect(out(layout, "session/resume")).toHaveLength(1);
    expect(out(layout, "session/prompt")).toHaveLength(2);
    expect(readPhase(layout)).toMatchObject({ phase: "exited", reason: "turn-ended" });
  });
});

describe("TurnsConfineTheAdapter", () => {
  const within = (path: string, dir: string) => {
    const d = dir.replace(/\/+$/, "");
    return path === d || path.startsWith(`${d}/`);
  };
  // The fixture's run directory lives under the temp directory, which `muster run` refuses for a fenced run;
  // an allowWrite entry that holds the whole fixture says nothing about where the launch cache sits in the run.
  const writable = (options: any) => (options.sandbox.filesystem.allowWrite as string[]).filter((w) => !within(home, w));

  function assertConfined(layout: RunPaths, options: any) {
    const echoed = JSON.parse(readFileSync(layout.stderrLog, "utf8")) as Record<string, string>;
    const launched = [echoed.npm_config_cache, echoed.BUN_INSTALL_CACHE_DIR];
    expect(launched.every((p) => typeof p === "string" && within(p, layout.runDir))).toBe(true);
    for (const w of [layout.cache, ...writable(options)]) {
      for (const p of launched) expect(within(p, w)).toBe(false);
    }
    expect(options.env).toMatchObject({ npm_config_cache: join(layout.cache, "npm"), BUN_INSTALL_CACHE_DIR: join(layout.cache, "bun") });
    for (const p of [options.env.npm_config_cache, options.env.BUN_INSTALL_CACHE_DIR]) {
      expect(options.sandbox.filesystem.allowWrite.some((w: string) => within(p, w))).toBe(true);
    }
  }

  test("L1: run and followup start the adapter from an install cache the sandbox cannot write; the worker's Bash gets the writable cache", async () => {
    const layout = await firstTurn(scenario({ echoEnv: true }));
    assertConfined(layout, out(layout, "session/new")[0]._meta.claudeCode.options);
    await followupVerb("a1", "next", env(), { env: agentEnv(scenario({ echoEnv: true })), exit: () => {} });
    assertConfined(layout, out(layout, "session/resume")[0]._meta.claudeCode.options);
  });
});

describe("TurnsReplayTheHostList", () => {
  // The client reads the host list from both the options' env and process.env; each turn sets both.
  async function withAllowHosts<T>(hosts: string, fn: (env: Record<string, string>) => Promise<T>): Promise<T> {
    const previous = process.env.MUSTER_ALLOW_HOSTS;
    process.env.MUSTER_ALLOW_HOSTS = hosts;
    try {
      return await fn({ MUSTER_ALLOW_HOSTS: hosts });
    } finally {
      if (previous === undefined) delete process.env.MUSTER_ALLOW_HOSTS;
      else process.env.MUSTER_ALLOW_HOSTS = previous;
    }
  }

  test("H1: a followup with a different MUSTER_ALLOW_HOSTS sends the session, and its fetch policy uses, the list recorded at dispatch", async () => {
    const recorded = ["registry.npmjs.org", "a.example.org"];
    const layout = runPaths("a1", env());
    await withAllowHosts("a.example.org", (hosts) =>
      runWorker(request(), layout, { env: { ...agentEnv(scenario({ replies: ["DONE\nfirst"] })), ...hosts }, exit: () => {} }),
    );
    expect(JSON.parse(readFileSync(layout.meta, "utf8")).allowedHosts).toEqual(recorded);
    expect(out(layout, "session/new")[0]._meta.claudeCode.options.sandbox.network.allowedDomains).toEqual(recorded);

    const fetchA = { toolCallId: "f", kind: "fetch", title: "Fetch", rawInput: { url: "https://a.example.org/x", prompt: "x" } };
    await withAllowHosts("b.example.org", (hosts) =>
      followupVerb("a1", "next", env(), { env: { ...agentEnv(scenario({ permission: { toolCall: fetchA } })), ...hosts }, exit: () => {} }),
    );
    expect(out(layout, "session/resume")[0]._meta.claudeCode.options.sandbox.network.allowedDomains).toEqual(recorded);
    const decisions = events(layout.events).filter((e) => e.dir === "client-decision").map((e) => e.msg);
    expect(decisions).toEqual([{ decision: "allow", by: "policy", host: "a.example.org" }]);
  });

  test("H2: a run recorded without a host list resumes with the default hosts only", async () => {
    const layout = await firstTurn();
    const meta = JSON.parse(readFileSync(layout.meta, "utf8"));
    delete meta.allowedHosts;
    writeFileSync(layout.meta, JSON.stringify(meta));
    await withAllowHosts("b.example.org", (hosts) =>
      followupVerb("a1", "next", env(), { env: { ...agentEnv(scenario()), ...hosts }, exit: () => {} }),
    );
    expect(out(layout, "session/resume")[0]._meta.claudeCode.options.sandbox.network.allowedDomains).toEqual(["registry.npmjs.org"]);
  });
});
