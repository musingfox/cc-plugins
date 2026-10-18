import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runWorker, type DispatchRequest } from "../src/session";
import { readPhase, runPaths, type RunPaths } from "../src/layout";
import { makeRepo } from "./support/repo";

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

function envFor(sc: object, extra: Record<string, string> = {}): Record<string, string> {
  return {
    HOME: home,
    MUSTER_HOME: home,
    MUSTER_AGENT_CMD: JSON.stringify([process.execPath, FAKE]),
    FAKE_AGENT_SCENARIO: JSON.stringify(sc),
    FAKE_AGENT_SCRIPT: SCRIPT,
    MUSTER_POLL_MS: "20",
    MUSTER_KILL_GRACE_MS: "200",
    ...extra,
  };
}

function request(model = "claude-haiku-5-5"): DispatchRequest {
  return { ticket: "Write the hello file", model, repoRoot: repo, baseRef: "HEAD" };
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
});
