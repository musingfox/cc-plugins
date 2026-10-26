import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WorktreeError } from "../src/worktree";
import { recordFetch, runWorker, type DispatchRequest } from "../src/session";
import { readPhase, runPaths, writePhase, type RunPaths } from "../src/layout";
import { commitFile, git, makeRepo, removeFixtures } from "./support/repo";
import { USER_TEMP_WRITES } from "./support/user-temp";

afterAll(removeFixtures);

const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const SCRIPT = join(import.meta.dir, "support", "scenarios", "permission-turn.ts");
const RUNS = join(import.meta.dir, "..", ".test-runs");
const OFFERED = ["claude-haiku-5-5", "claude-sonnet-5-5"];

let home: string;
let repo: string;

beforeEach(() => {
  mkdirSync(RUNS, { recursive: true });
  home = mkdtempSync(join(RUNS, "session-"));
  repo = makeRepo();
  process.env.MUSTER_IDLE_TIMEOUT_MS = "500";
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
  delete process.env.MUSTER_IDLE_TIMEOUT_MS;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await sleep(10);
  return check();
}

function session(offered: string[] = OFFERED) {
  return {
    initialize: { agentInfo: { name: "claude-agent-acp", version: "0.93.0" } },
    "session/new": {
      sessionId: "sess-1",
      configOptions: [
        {
          id: "model",
          category: "model",
          currentValue: offered[0],
          options: offered.map((value) => ({ value, name: value })),
        },
        { id: "mode", category: "mode", currentValue: "auto", options: [{ value: "default" }, { value: "auto" }] },
      ],
    },
  };
}

function scenario(extra: object = {}, offered: string[] = OFFERED) {
  return { results: session(offered), ...extra };
}

function fakeCmd(sc: object, script: string): string {
  return JSON.stringify([
    "env",
    `FAKE_AGENT_SCENARIO=${JSON.stringify(sc)}`,
    `FAKE_AGENT_SCRIPT=${script}`,
    process.execPath,
    FAKE,
  ]);
}

function envFor(sc: object, extra: Record<string, string> = {}): Record<string, string> {
  return {
    HOME: home,
    MUSTER_HOME: home,
    MUSTER_AGENT_CMD: fakeCmd(sc, SCRIPT),
    MUSTER_POLL_MS: "20",
    MUSTER_KILL_GRACE_MS: "200",
    ...extra,
  };
}

function request(model = "claude-haiku-5-5", fenced = true): DispatchRequest {
  return { ticket: "Write the hello file", model, repoRoot: repo, baseRef: "HEAD", fenced };
}

function layoutFor(name = "run-1"): RunPaths {
  return runPaths(name, { MUSTER_HOME: home, HOME: home });
}

function events(path: string) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { t: string; dir: string; msg: any });
}

function outMethods(path: string): string[] {
  return events(path)
    .filter((e) => e.dir === "out" && e.msg.method !== undefined)
    .map((e) => e.msg.method as string);
}

function promptText(path: string): string {
  const prompt = events(path).find((e) => e.dir === "out" && e.msg.method === "session/prompt");
  return prompt?.msg.params.prompt[0].text as string;
}

function readReportFile(layout: RunPaths): string | undefined {
  return existsSync(layout.report) ? readFileSync(layout.report, "utf8") : undefined;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("WorkerSessionLoop", () => {
  test("T1: an end_turn with no report leaves the worker idle, records the stopReason, and writes no REPORT.md", async () => {
    const layout = layoutFor();
    const exits: number[] = [];
    const done = runWorker(request(), layout, { env: envFor(scenario()), exit: (c) => exits.push(c) });
    expect(await waitFor(() => readPhase(layout)?.stopReason === "end_turn")).toBe(true);
    expect(readPhase(layout)?.phase).toBe("idle");
    expect(existsSync(layout.report)).toBe(false);
    await done;
    expect(exits).toEqual([0]);
  });

  test("T1b: a copyDeps failure is recorded as depsError and the worker still runs to its normal exit", async () => {
    const layout = layoutFor();
    const exits: number[] = [];
    const done = runWorker(request(), layout, {
      env: envFor(scenario()),
      exit: (c) => exits.push(c),
      copyDeps: () => {
        throw new WorktreeError("listing the tree at abc failed", "fatal: bad object");
      },
    });
    expect(await waitFor(() => readPhase(layout)?.stopReason === "end_turn")).toBe(true);
    await done;
    expect(exits).toEqual([0]);
    expect(readPhase(layout)?.deps).toEqual([]);
    expect(String(readPhase(layout)?.depsError)).toContain("listing the tree at abc failed");
  });

  test("T2: a cancelled turn leaves a REPORT.md that the client did not touch", async () => {
    const layout = layoutFor();
    const exits: number[] = [];
    const sc = scenario({ stopReason: "cancelled", writeReport: "DONE\nx" });
    const done = runWorker(request(), layout, { env: envFor(sc), exit: (c) => exits.push(c) });
    expect(await waitFor(() => readPhase(layout)?.stopReason === "cancelled")).toBe(true);
    expect(readReportFile(layout)).toBe("DONE\nx");
    await done;
    expect(readReportFile(layout)).toBe("DONE\nx");
    expect(exits).toEqual([0]);
  });

  test("T3: the models the turn used are recorded in phase.json", async () => {
    const layout = layoutFor();
    const sc = scenario({ modelUsage: [{ model: "claude-haiku-5-5" }] });
    const done = runWorker(request(), layout, { env: envFor(sc), exit: () => {} });
    expect(await waitFor(() => readPhase(layout)?.models !== undefined)).toBe(true);
    expect(readPhase(layout)?.models).toEqual(["claude-haiku-5-5"]);
    await done;
  });

  test("T4: a model the adapter does not offer blocks the run before any prompt", async () => {
    const layout = layoutFor();
    const exits: number[] = [];
    await runWorker(request("claude-haiku-5-5"), layout, {
      env: envFor(scenario({}, ["claude-sonnet-5-5"])),
      exit: (c) => exits.push(c),
    });
    expect(exits).toEqual([1]);
    expect(readReportFile(layout)?.split("\n")[0]).toBe("BLOCKED");
    expect(readReportFile(layout)).toContain("handshake-failed");
    expect(outMethods(layout.events)).not.toContain("session/prompt");
  });

  test("T5: the parent's ANTHROPIC_API_KEY never reaches the agent or any file in the run dir", async () => {
    const layout = layoutFor();
    const sc = scenario({ echoEnv: true });
    const env = envFor(sc, { ANTHROPIC_API_KEY: "sk-leak" });
    const done = runWorker(request(), layout, { env, exit: () => {} });
    expect(await waitFor(() => readPhase(layout)?.stopReason === "end_turn")).toBe(true);
    await done;
    for (const file of walk(layout.runDir)) {
      expect(readFileSync(file).includes(Buffer.from("sk-leak"))).toBe(false);
    }
    const echoed = JSON.parse(readFileSync(layout.stderrLog, "utf8")) as Record<string, string>;
    expect(echoed).not.toHaveProperty("ANTHROPIC_API_KEY");
  });

  test("T6: the first prompt carries the ticket and the report file path", async () => {
    const layout = layoutFor();
    await runWorker(request(), layout, { env: envFor(scenario({ promptDelayMs: 0 })), exit: () => {} });
    const text = promptText(layout.events);
    expect(text).toContain("Write the hello file");
    expect(text).toContain(`Report file: ${layout.report}`);
  });

  test("T7: meta.json names the run branch and the real worktree path", async () => {
    const layout = layoutFor("run-7");
    await runWorker(request(), layout, { env: envFor(scenario()), exit: () => {} });
    const meta = JSON.parse(readFileSync(layout.meta, "utf8"));
    expect(meta.branch).toBe("muster/run-7");
    expect(meta.worktree).toBe(realpathSync(layout.worktree));
  });

  test("T8: phase is running while a turn is in flight and question while a question is pending", async () => {
    const layout = layoutFor();
    const outside = join(home, "outside.txt");
    const sc = scenario({
      permission: { toolCall: { toolCallId: "t-w", kind: "edit", title: "Write", locations: [{ path: outside }], rawInput: { file_path: outside, content: "x" } } },
      writeOnAllow: { path: outside, content: "x" },
      promptDelayMs: 800,
    });
    const done = runWorker(request(), layout, { env: envFor(sc), exit: () => {} });
    expect(await waitFor(() => existsSync(layout.question(1)))).toBe(true);
    expect(readPhase(layout)?.phase).toBe("question");
    writeFileSync(layout.answer(1), JSON.stringify({ decision: "allow" }));
    expect(await waitFor(() => readPhase(layout)?.phase === "running")).toBe(true);
    expect(readPhase(layout)?.stopReason).toBeUndefined();
    await done;
    expect(readPhase(layout)?.reason).toBe("idle-timeout");
  });

  test("T9: an agent binary that cannot start blocks the run with agent-launch-failed and no prompt", async () => {
    const layout = layoutFor();
    const exits: number[] = [];
    await runWorker(request(), layout, {
      env: envFor(scenario(), { MUSTER_AGENT_CMD: '["/no/such/binary"]' }),
      exit: (c) => exits.push(c),
    });
    expect(exits).toEqual([1]);
    const lines = readReportFile(layout)?.split("\n") ?? [];
    expect(lines[0]).toBe("BLOCKED");
    expect(lines[1]).toContain("agent-launch-failed");
    expect(outMethods(layout.events)).not.toContain("session/prompt");
  });

  test("T10: the agent exiting during a turn blocks the run with agent-exited and its exit code", async () => {
    const layout = layoutFor();
    const exits: number[] = [];
    const sc = scenario({ termination: { exitOnMethod: { "session/prompt": 3 } } });
    await runWorker(request(), layout, { env: envFor(sc), exit: (c) => exits.push(c) });
    expect(exits).toEqual([1]);
    const lines = readReportFile(layout)?.split("\n") ?? [];
    expect(lines[0]).toBe("BLOCKED");
    expect(lines[1]).toContain("agent-exited");
    expect(lines[1]).toContain("3");
  });

  test("T11: a JSON-RPC error on the prompt blocks the run with prompt-error", async () => {
    const layout = layoutFor();
    const exits: number[] = [];
    const sc = scenario({ errors: { "session/prompt": "boom" } });
    await runWorker(request(), layout, { env: envFor(sc), exit: (c) => exits.push(c) });
    expect(exits).toEqual([1]);
    expect(readReportFile(layout)).toContain("prompt-error");
  });

  test("T12: an idle timeout after a DONE report exits 0 without a spurious agent-exited", async () => {
    process.env.MUSTER_IDLE_TIMEOUT_MS = "300";
    const layout = layoutFor();
    const exits: number[] = [];
    const sc = scenario({ writeReport: "DONE\nall good" });
    await runWorker(request(), layout, { env: envFor(sc, { MUSTER_IDLE_TIMEOUT_MS: "300" }), exit: (c) => exits.push(c) });
    expect(exits).toEqual([0]);
    expect(readReportFile(layout)).toBe("DONE\nall good");
    expect(readPhase(layout)?.reason).toContain("idle-timeout");
    const everything = [JSON.stringify(readPhase(layout)), readFileSync(layout.events, "utf8"), readFileSync(layout.stderrLog, "utf8")];
    for (const text of everything) expect(text).not.toContain("agent-exited");
  });

  test("R3: the session creates no per-run temp dir and hands the agent no temp env or sandbox root", async () => {
    const layout = layoutFor("r1");
    const exits: number[] = [];
    await runWorker(request(), layout, { env: envFor(scenario({ echoEnv: true })), exit: (c) => exits.push(c) });
    const tmp = join(layout.runDir, "tmp");
    expect(existsSync(tmp)).toBe(false);
    const echoed = JSON.parse(readFileSync(layout.stderrLog, "utf8")) as Record<string, string>;
    expect(JSON.stringify(echoed)).not.toContain(tmp);
    const sessionNew = events(layout.events).find((e) => e.dir === "out" && e.msg.method === "session/new");
    expect(JSON.stringify(sessionNew?.msg.params)).not.toContain(tmp);
    expect(exits).toEqual([0]);
  });

  test("R1: the agent exiting during a follow-up turn blocks the run with agent-exited", async () => {
    const script = join(home, "second-prompt-exits.ts");
    writeFileSync(
      script,
      `import * as base from ${JSON.stringify(SCRIPT)};\nlet n = 0;\nexport const setup = base.setup;\nexport function handle(msg: any, io: any) {\n  if (msg.method === "session/prompt" && ++n === 2) process.exit(3);\n  return base.handle(msg, io);\n}\n`,
    );
    const layout = layoutFor();
    const exits: number[] = [];
    const sc = scenario({ writeReport: "DONE\nfirst" });
    const run = runWorker(request(), layout, { env: { ...envFor(sc), MUSTER_AGENT_CMD: fakeCmd(sc, script) }, exit: (c) => exits.push(c) });
    expect(await waitFor(() => readPhase(layout)?.phase === "idle")).toBe(true);
    writeFileSync(join(layout.runDir, "FOLLOWUP-1.md"), "second");
    await run;
    expect(exits).toEqual([1]);
    const lines = readReportFile(layout)?.split("\n") ?? [];
    expect(lines[0]).toBe("BLOCKED");
    expect(lines[1]).toContain("agent-exited");
  });

  test("F1: a commit made in the clone is fetched back into the user's repo when the idle timeout ends the run", async () => {
    const layout = layoutFor();
    const exits: number[] = [];
    const run = runWorker(request(), layout, { env: envFor(scenario()), exit: (c) => exits.push(c) });
    expect(await waitFor(() => readPhase(layout)?.phase === "idle")).toBe(true);
    const sha = commitFile(layout.worktree, "late.txt", "x\n", "feat: late");
    await run;
    expect(readPhase(layout)?.reason).toBe("idle-timeout");
    expect(git(repo, ["rev-parse", "muster/run-1"])).toBe(sha);
  });

  test("F2: a stopped run's branch is fetched back and the clone is not a worktree of the user's repo", async () => {
    const layout = layoutFor();
    const exits: number[] = [];
    void runWorker(request(), layout, { env: envFor(scenario()), exit: (c) => exits.push(c) });
    expect(await waitFor(() => readPhase(layout)?.phase === "idle")).toBe(true);
    const sha = commitFile(layout.worktree, "stop.txt", "x\n", "feat: stop");
    writeFileSync(layout.stop, "");
    expect(await waitFor(() => exits.length > 0)).toBe(true);
    expect(readPhase(layout)?.reason).toBe("stopped");
    expect(git(repo, ["rev-parse", "muster/run-1"])).toBe(sha);
    expect(git(repo, ["worktree", "list", "--porcelain"])).not.toContain(layout.worktree);
  });

  test("F3: a crashed run's branch is fetched back too", async () => {
    const layout = layoutFor();
    const sc = scenario({ termination: { exitOnMethod: { "session/prompt": 3 } } });
    await runWorker(request(), layout, { env: envFor(sc), exit: () => {} });
    expect(readPhase(layout)?.reason).toBe("agent-exited");
    expect(git(repo, ["rev-parse", "muster/run-1"])).toBe(git(layout.worktree, ["rev-parse", "HEAD"]));
  });

  test("F4: a failed fetch-back is recorded in phase.json and does not stop the run from ending", async () => {
    const layout = layoutFor();
    const exits: number[] = [];
    void runWorker(request(), layout, { env: envFor(scenario()), exit: (c) => exits.push(c) });
    expect(await waitFor(() => readPhase(layout)?.phase === "idle")).toBe(true);
    git(repo, ["switch", "-q", "muster/run-1"]);
    commitFile(layout.worktree, "refused.txt", "x\n", "feat: refused");
    writeFileSync(layout.stop, "");
    expect(await waitFor(() => exits.length > 0)).toBe(true);
    expect(exits).toEqual([0]);
    expect(readPhase(layout)?.phase).toBe("exited");
    expect(String(readPhase(layout)?.fetchError)).toContain("checked out");
  });

  test("C1: the cache dir exists, the agent env points npm and bun at it, and session/new allows writes to it only", async () => {
    const layout = layoutFor();
    await runWorker(request(), layout, { env: envFor(scenario({ echoEnv: true })), exit: () => {} });
    expect(statSync(layout.cache).isDirectory()).toBe(true);
    const echoed = JSON.parse(readFileSync(layout.stderrLog, "utf8")) as Record<string, string>;
    expect(echoed.npm_config_cache).toBe(join(layout.cache, "npm"));
    expect(echoed.BUN_INSTALL_CACHE_DIR).toBe(join(layout.cache, "bun"));
    const sessionNew = events(layout.events).find((e) => e.dir === "out" && e.msg.method === "session/new");
    expect(sessionNew?.msg.params._meta.claudeCode.options.sandbox.filesystem.allowWrite).toEqual([layout.cache, ...USER_TEMP_WRITES]);
  });

  test("F1: an unfenced run sends session/new without a sandbox key", async () => {
    const layout = layoutFor();
    await runWorker(request("claude-haiku-5-5", false), layout, { env: envFor(scenario({})), exit: () => {} });
    const sessionNew = events(layout.events).find((e) => e.dir === "out" && e.msg.method === "session/new");
    expect(sessionNew?.msg.params._meta.claudeCode.options).not.toHaveProperty("sandbox");
  });
});

describe("RecordDepsOutcome", () => {
  function depsRepo(): string {
    writeFileSync(join(repo, "bun.lock"), "lock\n");
    git(repo, ["add", "bun.lock"]);
    git(repo, ["commit", "-q", "-m", "add lock"]);
    mkdirSync(join(repo, "node_modules/x"), { recursive: true });
    writeFileSync(join(repo, "node_modules/x/index.js"), "x\n");
    return repo;
  }

  test("T1: a committed lockfile copies node_modules and phase.json records the copy after the run ends", async () => {
    depsRepo();
    const layout = layoutFor();
    const exits: number[] = [];
    await runWorker(request(), layout, { env: envFor(scenario({ writeReport: "DONE\nok" })), exit: (c) => exits.push(c) });
    expect(exits).toEqual([0]);
    expect(readPhase(layout)?.deps).toEqual([{ dir: ".", outcome: "copied" }]);
  });

  test("T2: node_modules is already in the worker cwd when the agent process starts", async () => {
    depsRepo();
    const layout = layoutFor();
    const listing = join(home, "listing.txt");
    const sc = scenario({ writeReport: "DONE\nok" });
    const [sh, ...fake] = JSON.parse(fakeCmd(sc, SCRIPT)) as string[];
    const wrapped = ["/bin/sh", "-c", `ls node_modules > '${listing}'; exec "$@"`, sh, ...fake];
    const env = { ...envFor(sc), MUSTER_AGENT_CMD: JSON.stringify(wrapped) };
    await runWorker(request(), layout, { env, exit: () => {} });
    expect(readFileSync(listing, "utf8")).toContain("x");
  });

  test("T3: a repo with no lockfile records an empty deps list", async () => {
    const layout = layoutFor();
    await runWorker(request(), layout, { env: envFor(scenario()), exit: () => {} });
    expect(readPhase(layout)?.deps).toEqual([]);
  });

  test("T4: an uncommitted lockfile edit records lockfile-differs and the run still reaches done", async () => {
    depsRepo();
    writeFileSync(join(repo, "bun.lock"), "edited\n");
    const layout = layoutFor();
    const exits: number[] = [];
    await runWorker(request(), layout, { env: envFor(scenario({ writeReport: "DONE\nok" })), exit: (c) => exits.push(c) });
    expect(exits).toEqual([0]);
    expect(readPhase(layout)?.deps).toEqual([{ dir: ".", outcome: "lockfile-differs", detail: "bun.lock" }]);
    expect(readPhase(layout)?.phase).toBe("exited");
  });
});

describe("recordFetch", () => {
  test("W3b: the head of the fetch that made the run collectable survives a later fetch of the same report", () => {
    const p = runPaths("w3", { MUSTER_HOME: join(home, "m"), HOME: home });
    mkdirSync(p.runDir, { recursive: true });
    recordFetch(p, { ok: true, sha: "first" });
    recordFetch(p, { ok: true, sha: "second" });
    expect(readPhase(p)).toMatchObject({ fetched: true, head: "first" });
  });

  test("W3c: a new turn clears fetched, so its fetch records its own head", () => {
    const p = runPaths("w3", { MUSTER_HOME: join(home, "m"), HOME: home });
    mkdirSync(p.runDir, { recursive: true });
    recordFetch(p, { ok: true, sha: "first" });
    writePhase(p, { fetched: false });
    recordFetch(p, { ok: true, sha: "second" });
    expect(readPhase(p)?.head).toBe("second");
  });

  test("W3d: a failed fetch records no head", () => {
    const p = runPaths("w3", { MUSTER_HOME: join(home, "m"), HOME: home });
    mkdirSync(p.runDir, { recursive: true });
    recordFetch(p, { ok: false, error: "refused" });
    expect(readPhase(p)).toMatchObject({ fetched: true, fetchError: "refused" });
    expect(readPhase(p)?.head).toBeUndefined();
  });
});

describe("SessionWiresProgress", () => {
  test("T1: the run's phase file ends with the title, plan, tools and cost its session updates produced", async () => {
    const layout = layoutFor();
    const updates = [
      { sessionUpdate: "plan", entries: [{ content: "a", priority: "high", status: "completed" }, { content: "b", priority: "low", status: "pending" }] },
      { sessionUpdate: "tool_call", toolCallId: "t1" },
      { sessionUpdate: "usage_update", size: 1, used: 1, cost: { amount: 0.5, currency: "USD" } },
      { sessionUpdate: "session_info_update", title: "Real title" },
    ];
    await runWorker(request(), layout, { env: envFor(scenario({ updates })), exit: () => {} });
    expect(readPhase(layout)).toMatchObject({ title: "Real title", plan: { done: 1, total: 2 }, tools: 1, cost: 0.5 });
  });

  test("T2: while the phase is starting the phase file already carries the ticket title and zero tools", async () => {
    const layout = layoutFor();
    const done = runWorker(request(), layout, { env: envFor(scenario({ initializeDelayMs: 200 })), exit: () => {} });
    expect(await waitFor(() => readPhase(layout)?.title !== undefined)).toBe(true);
    expect(readPhase(layout)).toMatchObject({ phase: "starting", title: "Write the hello file", tools: 0 });
    await done;
  });

  test("T3: malformed update objects change no figure and the run still completes", async () => {
    const layout = layoutFor();
    await runWorker(request(), layout, { env: envFor(scenario({ updates: [null, 7, { sessionUpdate: "plan", entries: "x" }] })), exit: () => {} });
    expect(readPhase(layout)?.stopReason).toBe("end_turn");
    expect(readPhase(layout)).not.toHaveProperty("plan");
  });
});
