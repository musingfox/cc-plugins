import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openChannel, type Channel } from "../src/channel";
import { createPermissionHandler } from "../src/escalation";
import { createRunDir, runPaths, type RunPaths } from "../src/layout";

const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const SCRIPT = join(import.meta.dir, "support", "scenarios", "permission-turn.ts");
const RUNS = join(import.meta.dir, "..", ".test-runs");
const OUTSIDE = "/tmp/muster-t/outside.txt";

let home: string;
let channels: Channel[] = [];

beforeEach(() => {
  mkdirSync(RUNS, { recursive: true });
  home = mkdtempSync(join(RUNS, "escalation-"));
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

function writeTool(path: string) {
  return { toolCallId: "t-w", kind: "edit", title: "Write", locations: [{ path }], rawInput: { file_path: path, content: "x" } };
}

async function setup(scenario: object = {}, name = "run-1") {
  const layout: RunPaths = runPaths(name, { MUSTER_HOME: home, HOME: home });
  createRunDir(layout);
  mkdirSync(layout.worktree, { recursive: true });
  const worktreeReal = realpathSync(layout.worktree);
  const pending: Array<() => void> = [];
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
      trackPending: (cancel) => {
        pending.push(cancel);
        return () => {
          pending.splice(pending.indexOf(cancel), 1);
        };
      },
      terminate,
      logDecision: (m) => ch.logDecision(m),
      env: { MUSTER_POLL_MS: "20", MUSTER_QUESTION_TIMEOUT_MS: "60000" },
    }),
  );
  return { ch, layout, pending };
}

describe("EscalationRoundTrip", () => {
  test("T1: an in-worktree Write is allowed by policy with no QUESTION file", async () => {
    const inside = join(runPaths("run-1", { MUSTER_HOME: home, HOME: home }).worktree, "a.txt");
    const { ch, layout } = await setup({
      permission: { toolCall: writeTool(inside) },
      writeOnAllow: { path: inside, content: "hi" },
    });
    const stop = await ch.request("session/prompt", { sessionId: "sess-1" });
    expect(stop).toEqual({ stopReason: "end_turn" });
    expect(existsSync(layout.question(1))).toBe(false);
    expect(outReplyFor(layout.events, "perm-1").result.outcome).toEqual({ outcome: "selected", optionId: "allow-once" });
    expect(decisions(layout.events)).toEqual([{ decision: "allow", by: "policy" }]);
  });

  test("T2: an outside Write pauses until ANSWER-1 allows it, then replies allow-once", async () => {
    const { ch, layout } = await setup({ permission: { toolCall: writeTool(OUTSIDE) } });
    const turn = ch.request("session/prompt", { sessionId: "sess-1" });
    expect(await waitFor(() => existsSync(layout.question(1)))).toBe(true);
    await sleep(100);
    expect(outReplyFor(layout.events, "perm-1")).toBeUndefined();

    const q = JSON.parse(readFileSync(layout.question(1), "utf8"));
    expect(q).toMatchObject({
      n: 1,
      requestId: "perm-1",
      toolCallId: "t-w",
      kind: "edit",
      paths: [OUTSIDE],
      options: [
        { optionId: "allow-once", kind: "allow_once", name: "Allow once" },
        { optionId: "reject-once", kind: "reject_once", name: "Reject once" },
      ],
    });
    expect(typeof q.reason).toBe("string");

    writeFileSync(layout.answer(1), JSON.stringify({ decision: "allow" }));
    expect(await turn).toEqual({ stopReason: "end_turn" });
    expect(outReplyFor(layout.events, "perm-1").result.outcome).toEqual({ outcome: "selected", optionId: "allow-once" });
    expect(decisions(layout.events)).toEqual([{ decision: "allow", by: "answer" }]);
  });

  test("T3: ANSWER deny replies reject and the agent's write never happens", async () => {
    const target = join(home, "denied.txt");
    const { ch, layout } = await setup({
      permission: { toolCall: writeTool(OUTSIDE) },
      writeOnAllow: { path: target, content: "x" },
    });
    const turn = ch.request("session/prompt", { sessionId: "sess-1" });
    expect(await waitFor(() => existsSync(layout.question(1)))).toBe(true);
    writeFileSync(layout.answer(1), JSON.stringify({ decision: "deny" }));
    await turn;
    expect(outReplyFor(layout.events, "perm-1").result.outcome).toEqual({ outcome: "selected", optionId: "reject-once" });
    expect(existsSync(target)).toBe(false);
  });

  test("T4: an ANSWER that is not JSON, or has another decision, denies as answer-invalid", async () => {
    const bad = await setup({ permission: { toolCall: writeTool(OUTSIDE) } }, "run-bad");
    const turnA = bad.ch.request("session/prompt", { sessionId: "sess-1" });
    expect(await waitFor(() => existsSync(bad.layout.question(1)))).toBe(true);
    writeFileSync(bad.layout.answer(1), "not json");
    await turnA;
    expect(outReplyFor(bad.layout.events, "perm-1").result.outcome).toEqual({ outcome: "selected", optionId: "reject-once" });
    expect(decisions(bad.layout.events)).toEqual([{ decision: "deny", by: "answer-invalid" }]);
    rmSync(bad.layout.events);

    const other = await setup({ permission: { toolCall: writeTool(OUTSIDE) } }, "run-other");
    const turnB = other.ch.request("session/prompt", { sessionId: "sess-1" });
    expect(await waitFor(() => existsSync(other.layout.question(1)))).toBe(true);
    writeFileSync(other.layout.answer(1), JSON.stringify({ decision: "maybe" }));
    await turnB;
    expect(decisions(other.layout.events)).toEqual([{ decision: "deny", by: "answer-invalid" }]);
  });

  test("T5: Bash without a command, Write with no path, and think/switch_mode all escalate", async () => {
    const cases = [
      { kind: "execute", toolCallId: "c1", title: "Bash", rawInput: {} },
      { kind: "edit", toolCallId: "c2", title: "Write", rawInput: {} },
      { kind: "think", toolCallId: "c3", title: "Think" },
      { kind: "switch_mode", toolCallId: "c5", title: "Mode" },
    ];
    for (const [i, toolCall] of cases.entries()) {
      const { ch, layout } = await setup({ permission: { toolCall } }, `run-t5-${i}`);
      const turn = ch.request("session/prompt", { sessionId: "sess-1" });
      expect(await waitFor(() => existsSync(layout.question(1)))).toBe(true);
      writeFileSync(layout.answer(1), JSON.stringify({ decision: "deny" }));
      await turn;
      expect(JSON.parse(readFileSync(layout.question(1), "utf8")).kind).toBe(toolCall.kind);
    }
  });

  test("T6: two concurrent outside writes get QUESTION-1 and QUESTION-2, each resolved by its own answer", async () => {
    const { ch, layout } = await setup({ permission: { toolCall: writeTool(OUTSIDE) } });
    const first = ch.request("fake/emit", {
      messages: [{ jsonrpc: "2.0", id: "r1", method: "session/request_permission", params: {
        sessionId: "s", toolCall: writeTool(OUTSIDE), options: [{ optionId: "allow-once", kind: "allow_once" }, { optionId: "reject-once", kind: "reject_once" }],
      } }],
    }).catch(() => {});
    expect(await waitFor(() => existsSync(layout.question(1)))).toBe(true);
    const second = ch.request("fake/emit", {
      messages: [{ jsonrpc: "2.0", id: "r2", method: "session/request_permission", params: {
        sessionId: "s", toolCall: writeTool(OUTSIDE), options: [{ optionId: "allow-once", kind: "allow_once" }, { optionId: "reject-once", kind: "reject_once" }],
      } }],
    }).catch(() => {});
    expect(await waitFor(() => existsSync(layout.question(2)))).toBe(true);
    writeFileSync(layout.answer(2), JSON.stringify({ decision: "deny" }));
    writeFileSync(layout.answer(1), JSON.stringify({ decision: "allow" }));
    expect(await waitFor(() => outReplyFor(layout.events, "r1") !== undefined && outReplyFor(layout.events, "r2") !== undefined)).toBe(true);
    expect(outReplyFor(layout.events, "r1").result.outcome.optionId).toBe("allow-once");
    expect(outReplyFor(layout.events, "r2").result.outcome.optionId).toBe("reject-once");
  });

  test("T7: a 10000-char rawInput string is truncated with a marker and the QUESTION file stays under 20 kB", async () => {
    const big = "a".repeat(10000);
    const toolCall = { kind: "edit", toolCallId: "big", title: "Write", locations: [{ path: OUTSIDE }], rawInput: { file_path: OUTSIDE, content: big } };
    const { ch, layout } = await setup({ permission: { toolCall } });
    const turn = ch.request("session/prompt", { sessionId: "sess-1" });
    expect(await waitFor(() => existsSync(layout.question(1)))).toBe(true);
    const raw = readFileSync(layout.question(1), "utf8");
    expect(Buffer.byteLength(raw)).toBeLessThan(20000);
    const content = JSON.parse(raw).rawInput.content as string;
    expect(content.length).toBeLessThan(big.length);
    expect(content).toMatch(/\[truncated \d+ chars\]$/);
    writeFileSync(layout.answer(1), JSON.stringify({ decision: "deny" }));
    await turn;
  });

  test("T8: a permission request with empty options replies cancelled", async () => {
    const { ch, layout } = await setup({ permission: { toolCall: writeTool(OUTSIDE), options: [] } });
    await ch.request("session/prompt", { sessionId: "sess-1" });
    expect(outReplyFor(layout.events, "perm-1").result.outcome).toEqual({ outcome: "cancelled" });
    expect(existsSync(layout.question(1))).toBe(false);
  });

  test("T9: a terminated pending question replies cancelled, logs terminated, and ignores a later ANSWER", async () => {
    const { ch, layout, pending } = await setup({ permission: { toolCall: writeTool(OUTSIDE) } });
    const turn = ch.request("session/prompt", { sessionId: "sess-1" });
    expect(await waitFor(() => existsSync(layout.question(1)))).toBe(true);
    expect(pending).toHaveLength(1);
    pending[0]();
    expect(await waitFor(() => outReplyFor(layout.events, "perm-1") !== undefined)).toBe(true);
    expect(outReplyFor(layout.events, "perm-1").result.outcome).toEqual({ outcome: "cancelled" });
    expect(pending).toHaveLength(0);
    writeFileSync(layout.answer(1), JSON.stringify({ decision: "allow" }));
    await sleep(100);
    expect(decisions(layout.events)).toEqual([{ decision: "cancelled", by: "terminated" }]);
    expect(outReplyFor(layout.events, "perm-1").result.outcome).toEqual({ outcome: "cancelled" });
    await turn;
  });

  test("R1: a request waiting for an answer does not stall the read loop", async () => {
    const { ch, layout } = await setup({ silent: ["fake/never"] });
    const earlier = ch.request("fake/never", {});
    const emit = ch.request("fake/emit", {
      messages: [
        { jsonrpc: "2.0", id: "perm-9", method: "session/request_permission", params: {
          sessionId: "s", toolCall: writeTool(OUTSIDE), options: [{ optionId: "allow-once", kind: "allow_once" }] } },
        { jsonrpc: "2.0", method: "session/update", params: { sessionId: "s", note: "after-permission" } },
        { jsonrpc: "2.0", id: 1, result: { done: true } },
      ],
    });
    await emit;
    expect(await waitFor(() => existsSync(layout.question(1)))).toBe(true);
    expect(await earlier).toEqual({ done: true });
    expect(await waitFor(() => events(layout.events).some((e) => e.dir === "in" && e.msg.method === "session/update"))).toBe(true);
    expect(outReplyFor(layout.events, "perm-9")).toBeUndefined();

    writeFileSync(layout.answer(1), JSON.stringify({ decision: "allow" }));
    expect(await waitFor(() => outReplyFor(layout.events, "perm-9") !== undefined)).toBe(true);
    expect(outReplyFor(layout.events, "perm-9").result.outcome).toEqual({ outcome: "selected", optionId: "allow-once" });
  });
});
