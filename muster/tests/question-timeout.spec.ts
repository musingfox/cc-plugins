import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { openChannel, type Channel } from "../src/channel";
import { handshake } from "../src/handshake";
import { createRunDir, runPaths, UsageError, type RunPaths } from "../src/layout";
import { awaitAnswerWithin, questionTimeoutMs } from "../src/question-timeout";
import { createTerminator, type TerminatorState } from "../src/termination";

const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const RUNS = join(import.meta.dir, "..", ".test-runs");
const ADAPTER_RESULTS = {
  initialize: { agentInfo: { name: "claude-agent-acp", version: "0.93.0" } },
  "session/new": { sessionId: "sess-1", configOptions: {} },
};

let home: string;
let channels: Channel[] = [];

beforeEach(() => {
  mkdirSync(RUNS, { recursive: true });
  home = mkdtempSync(join(RUNS, "question-timeout-"));
});

afterEach(async () => {
  for (const c of channels) await c.close();
  channels = [];
  rmSync(home, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function spyTerminate() {
  const calls: [string, string | undefined][] = [];
  const terminate = (reason: string, detail?: string) => {
    calls.push([reason, detail]);
    return Promise.resolve(1);
  };
  return { terminate: terminate as Parameters<typeof awaitAnswerWithin>[2], calls };
}

describe("QuestionTimeout", () => {
  test("T1: the env value resolves to the default 1800000 when unset, and to the given number otherwise", () => {
    expect(questionTimeoutMs({})).toBe(1800000);
    expect(questionTimeoutMs({ MUSTER_QUESTION_TIMEOUT_MS: "300" })).toBe(300);
  });

  test("T2: a non-numeric or non-positive env value throws UsageError", () => {
    expect(() => questionTimeoutMs({ MUSTER_QUESTION_TIMEOUT_MS: "abc" })).toThrow(UsageError);
    expect(() => questionTimeoutMs({ MUSTER_QUESTION_TIMEOUT_MS: "0" })).toThrow(UsageError);
  });

  test("T3: an answer that arrives within the limit resolves and leaves no timer behind", async () => {
    const spy = spyTerminate();
    const answer = new Promise<string>((resolve) => setTimeout(() => resolve("yes"), 100));
    expect(await awaitAnswerWithin(answer, 1, spy.terminate, 300)).toBe("yes");
    await sleep(600);
    expect(spy.calls).toHaveLength(0);
  });

  test("T4: no answer within the limit calls terminate once with question-timeout and the question number", async () => {
    const spy = spyTerminate();
    let settled = false;
    void awaitAnswerWithin(new Promise<string>(() => {}), 1, spy.terminate, 300).then(() => {
      settled = true;
    });
    await sleep(450);
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0][0]).toBe("question-timeout");
    expect(spy.calls[0][1]).toContain("question 1");
    expect(settled).toBe(false);
  });

  test("T5: a timed-out question on a real terminator cancels the child turn and the pending permission, and writes BLOCKED", async () => {
    const layout: RunPaths = runPaths("run-1", { MUSTER_HOME: home, HOME: home });
    createRunDir(layout);
    const ch = await openChannel({
      argv: [process.execPath, FAKE],
      env: { FAKE_AGENT_SCENARIO: JSON.stringify({ results: ADAPTER_RESULTS, silent: ["session/prompt"] }) },
      eventsPath: layout.events,
      stderrPath: layout.stderrLog,
    });
    channels.push(ch);
    const hs = await handshake(ch, { cache: "/tmp/muster-cache", worktree: home });
    const state: TerminatorState = { channel: ch, sessionId: hs.sessionId };
    state.turn = ch.request("session/prompt", { sessionId: hs.sessionId }).catch(() => {});

    let release: (value: unknown) => void = () => {};
    ch.onRequest("session/request_permission", () => new Promise((resolve) => (release = resolve)));
    const h = createTerminator({ layout, state, env: { MUSTER_KILL_GRACE_MS: "200" }, exit: () => {} });
    h.trackPending(() => release({ outcome: { outcome: "cancelled" } }));
    const events = () => readFileSync(layout.events, "utf8");
    void ch.request("fake/emit", {
      messages: [{ jsonrpc: "2.0", id: 9, method: "session/request_permission", params: {} }],
    });
    const deadline = Date.now() + 3000;
    while (!events().includes('"session/request_permission"') && Date.now() < deadline) await sleep(20);

    void awaitAnswerWithin(new Promise<string>(() => {}), 1, h.terminate, 200);
    while (!events().includes('"session/cancel"') && Date.now() < deadline) await sleep(20);
    expect(events()).toContain('"session/cancel"');
    while (!existsSync(layout.report) && Date.now() < deadline) await sleep(20);

    const lines = readFileSync(layout.report, "utf8").split("\n");
    expect(lines[0]).toBe("BLOCKED");
    expect(lines[1]).toContain("question-timeout");
    const reply = events()
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l))
      .find((e) => e.dir === "out" && e.msg.id === 9)?.msg;
    expect(reply?.result?.outcome?.outcome).toBe("cancelled");
    h.dispose();
  });
});
