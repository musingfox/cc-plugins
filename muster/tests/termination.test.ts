import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openChannel, type Channel } from "../src/channel";
import { handshake } from "../src/handshake";
import { createRunDir, runPaths, UsageError, type RunPaths } from "../src/layout";
import { createTerminator, killGraceMs, pollMs, type TerminatorState } from "../src/termination";

const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const SCRIPT = join(import.meta.dir, "support", "scenarios", "termination.ts");
const RUNS = join(import.meta.dir, "..", ".test-runs");
const ADAPTER_RESULTS = {
  initialize: { agentInfo: { name: "claude-agent-acp", version: "0.93.0" } },
  "session/new": { sessionId: "sess-1", configOptions: {} },
};

let home: string;
let channels: Channel[] = [];

beforeEach(() => {
  mkdirSync(RUNS, { recursive: true });
  home = mkdtempSync(join(RUNS, "termination-"));
});

afterEach(async () => {
  for (const c of channels) await c.close();
  channels = [];
  rmSync(home, { recursive: true, force: true });
});

async function setup(scenario: object = {}) {
  const layout: RunPaths = runPaths("run-1", { MUSTER_HOME: home, HOME: home });
  createRunDir(layout);
  const ch = await openChannel({
    argv: [process.execPath, FAKE],
    env: {
      FAKE_AGENT_SCENARIO: JSON.stringify(scenario),
      FAKE_AGENT_SCRIPT: SCRIPT,
    },
    eventsPath: layout.events,
    stderrPath: layout.stderrLog,
  });
  channels.push(ch);
  return { ch, layout };
}

function harness(layout: RunPaths, state: TerminatorState, env: Record<string, string> = {}) {
  const codes: number[] = [];
  const t = createTerminator({
    layout,
    state,
    env: { MUSTER_KILL_GRACE_MS: "200", ...env },
    exit: (code) => codes.push(code),
  });
  return { ...t, codes };
}

function outMessages(path: string) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; msg: any })
    .filter((e) => e.dir === "out")
    .map((e) => e.msg);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  return check();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("WorkerTermination", () => {
  test("T1: STOP file cancels the prompt, kills the child and writes BLOCKED reason stopped", async () => {
    const { ch, layout } = await setup({
      results: ADAPTER_RESULTS,
      silent: ["session/prompt"],
    });
    const hs = await handshake(ch, { cache: "/tmp/muster-cache", worktree: home });
    const state: TerminatorState = { channel: ch, sessionId: hs.sessionId };
    state.turn = ch.request("session/prompt", { sessionId: hs.sessionId }).catch(() => {});
    const h = harness(layout, state);
    h.watch();
    writeFileSync(layout.stop, "");

    expect(await waitFor(() => h.codes.length === 1)).toBe(true);
    const cancel = outMessages(layout.events).find((m) => m.method === "session/cancel");
    expect(cancel?.params).toEqual({ sessionId: "sess-1" });
    expect(alive(ch.pid)).toBe(false);
    const lines = readFileSync(layout.report, "utf8").split("\n");
    expect(lines[0]).toBe("BLOCKED");
    expect(lines[1]).toBe("reason: stopped");
    expect(h.codes).toEqual([0]);
    h.dispose();
  });

  test("T2: an existing DONE report is left byte-identical", async () => {
    const { ch, layout } = await setup({ results: ADAPTER_RESULTS, silent: ["session/prompt"] });
    const hs = await handshake(ch, { cache: "/tmp/muster-cache", worktree: home });
    const state: TerminatorState = { channel: ch, sessionId: hs.sessionId };
    state.turn = ch.request("session/prompt", { sessionId: hs.sessionId }).catch(() => {});
    writeFileSync(layout.report, "DONE\nok");
    const h = harness(layout, state);
    h.watch();
    writeFileSync(layout.stop, "");

    expect(await waitFor(() => h.codes.length === 1)).toBe(true);
    expect(readFileSync(layout.report, "utf8")).toBe("DONE\nok");
    expect(h.codes).toEqual([0]);
    h.dispose();
  });

  test("T3: child exiting mid-prompt writes BLOCKED agent-exited with its exit code and exits 1", async () => {
    const { ch, layout } = await setup({
      results: ADAPTER_RESULTS,
      termination: { exitOnMethod: { "session/prompt": 3 } },
    });
    const hs = await handshake(ch, { cache: "/tmp/muster-cache", worktree: home });
    const state: TerminatorState = { channel: ch, sessionId: hs.sessionId };
    const h = harness(layout, state);
    h.watch();
    state.turn = ch.request("session/prompt", { sessionId: hs.sessionId }).catch(() => {});

    expect(await waitFor(() => h.codes.length === 1)).toBe(true);
    expect(readFileSync(layout.report, "utf8").split("\n")[1]).toBe("reason: agent-exited: exit code 3");
    expect(h.codes).toEqual([1]);
    h.dispose();
  });

  test("T4: a launch failure writes BLOCKED agent-launch-failed without any session/cancel", async () => {
    const layout = runPaths("run-1", { MUSTER_HOME: home, HOME: home });
    createRunDir(layout);
    const launchErr = await openChannel({
      argv: ["/no/such/binary"],
      eventsPath: layout.events,
      stderrPath: layout.stderrLog,
    }).catch((e: Error) => e);
    const h = harness(layout, {});
    await h.terminate("agent-launch-failed", launchErr.message);

    expect(readFileSync(layout.report, "utf8")).toContain("reason: agent-launch-failed");
    expect(existsSync(layout.events) && readFileSync(layout.events, "utf8").includes("session/cancel")).toBe(false);
    expect(h.codes).toEqual([1]);
  });

  test("T5: a SIGTERM-trapping child survives SIGTERM and dies after terminate escalates to SIGKILL", async () => {
    const { ch, layout } = await setup({ termination: { trapSigterm: true } });
    const h = harness(layout, { channel: ch });
    await ch.request("fake/echo", {});
    process.kill(ch.pid, "SIGTERM");
    await sleep(300);
    expect(alive(ch.pid)).toBe(true);

    await h.terminate("stopped");
    expect(await waitFor(() => !alive(ch.pid))).toBe(true);
    expect(h.codes).toEqual([0]);
    h.dispose();
  });

  test("T6: a JSON-RPC error on session/prompt is recorded as BLOCKED prompt-error and exits 1", async () => {
    const { ch, layout } = await setup({ results: ADAPTER_RESULTS, errors: { "session/prompt": "model overloaded" } });
    const hs = await handshake(ch, { cache: "/tmp/muster-cache", worktree: home });
    const state: TerminatorState = { channel: ch, sessionId: hs.sessionId };
    const h = harness(layout, state);
    const err = await ch.request("session/prompt", { sessionId: hs.sessionId }).catch((e: Error) => e);
    await h.terminate("prompt-error", (err as Error).message);

    const lines = readFileSync(layout.report, "utf8").split("\n");
    expect(lines[0]).toBe("BLOCKED");
    expect(lines[1].startsWith("reason: prompt-error")).toBe(true);
    expect(h.codes).toEqual([1]);
    h.dispose();
  });

  test("T7: grace and poll env values resolve, invalid values throw UsageError", () => {
    expect(killGraceMs({})).toBe(5000);
    expect(killGraceMs({ MUSTER_KILL_GRACE_MS: "200" })).toBe(200);
    expect(() => killGraceMs({ MUSTER_KILL_GRACE_MS: "abc" })).toThrow(UsageError);
    expect(() => killGraceMs({ MUSTER_KILL_GRACE_MS: "0" })).toThrow(UsageError);
    expect(pollMs({})).toBe(500);
  });

  test("T8: a malformed REPORT.md is replaced and a valid BLOCKED report is kept", async () => {
    const { layout } = await setup();
    writeFileSync(layout.report, "done");
    await harness(layout, {}).terminate("stopped");
    expect(readFileSync(layout.report, "utf8").split("\n")[0]).toBe("BLOCKED");

    writeFileSync(layout.report, "BLOCKED\nneed key");
    await harness(layout, {}).terminate("stopped");
    expect(readFileSync(layout.report, "utf8")).toBe("BLOCKED\nneed key");
  });

  test("T9: tracked cancels run once, unregistered ones never, a throwing one does not stop the sequence", async () => {
    const { layout } = await setup();
    const h = harness(layout, {});
    const calls: string[] = [];
    h.trackPending(() => calls.push("a"));
    const unregister = h.trackPending(() => calls.push("b"));
    h.trackPending(() => {
      throw new Error("boom");
    });
    unregister();
    await h.terminate("stopped");

    expect(calls).toEqual(["a"]);
    expect(existsSync(layout.report)).toBe(true);
    expect(h.codes).toEqual([0]);
  });

  test("T10: overlapping terminate calls share one result, one exit and one session/cancel", async () => {
    const { ch, layout } = await setup({ results: ADAPTER_RESULTS, silent: ["session/prompt"] });
    const hs = await handshake(ch, { cache: "/tmp/muster-cache", worktree: home });
    const state: TerminatorState = { channel: ch, sessionId: hs.sessionId };
    state.turn = ch.request("session/prompt", { sessionId: hs.sessionId }).catch(() => {});
    const h = harness(layout, state);
    const [a, b] = await Promise.all([h.terminate("stopped"), h.terminate("stopped")]);

    expect(a).toBe(b);
    expect(h.codes).toEqual([0]);
    const cancels = outMessages(layout.events).filter((m) => m.method === "session/cancel");
    expect(cancels).toHaveLength(1);
    h.dispose();
  });

  test("T11: channel exposes a live pid and the child exit code, and close still resolves", async () => {
    const { ch } = await setup({ termination: { exitOnMethod: { "fake/ping": 3 } } });
    expect(Number.isInteger(ch.pid) && ch.pid > 0).toBe(true);
    expect(alive(ch.pid)).toBe(true);
    await ch.notify("fake/ping", {});
    expect(await ch.exited).toBe(3);
    await ch.close();
  });

  test("T12: dispose stops the STOP poll and the exit observer, so a deliberate close writes nothing", async () => {
    const { ch, layout } = await setup({ silent: ["session/prompt"] });
    const h = harness(layout, { channel: ch });
    h.watch();
    h.dispose();
    await ch.close();
    writeFileSync(layout.stop, "");
    await sleep(1000);

    expect(h.codes).toEqual([]);
    expect(existsSync(layout.report)).toBe(false);
  });
});
