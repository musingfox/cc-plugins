import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Channel, openChannel } from "../src/channel";
import { type RunPaths, readPhase, runPaths, writePhase } from "../src/layout";
import { idleTimeoutMs, runFollowupInbox } from "../src/inbox";

const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const RUNS = join(import.meta.dir, "..", ".test-runs");
const SESSION = "sess-1";

let dir: string;
let paths: RunPaths;
let channels: Channel[] = [];
let savedIdle: string | undefined;
let savedPoll: string | undefined;

beforeEach(async () => {
  mkdirSync(RUNS, { recursive: true });
  dir = mkdtempSync(join(RUNS, "inbox-"));
  paths = runPaths("r1", { MUSTER_HOME: dir, HOME: dir });
  mkdirSync(paths.runDir, { recursive: true });
  savedIdle = process.env.MUSTER_IDLE_TIMEOUT_MS;
  savedPoll = process.env.MUSTER_POLL_MS;
  process.env.MUSTER_IDLE_TIMEOUT_MS = "1000";
  process.env.MUSTER_POLL_MS = "10";
});

afterEach(async () => {
  for (const c of channels) await c.close();
  channels = [];
  restore("MUSTER_IDLE_TIMEOUT_MS", savedIdle);
  restore("MUSTER_POLL_MS", savedPoll);
  rmSync(dir, { recursive: true, force: true });
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function open(wrap?: (ch: Channel) => Channel): Promise<Channel> {
  const ch = await openChannel({
    argv: [process.execPath, FAKE],
    env: { FAKE_AGENT_SCENARIO: "{}" },
    eventsPath: paths.events,
    stderrPath: join(dir, "stderr.log"),
  });
  channels.push(ch);
  return wrap ? wrap(ch) : ch;
}

function events(): { dir: string; msg: any }[] {
  if (!existsSync(paths.events)) return [];
  return readFileSync(paths.events, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

function promptTexts(): string[] {
  return events()
    .filter((e) => e.dir === "out" && e.msg.method === "session/prompt")
    .map((e) => (e.msg.params.prompt[0].text as string));
}

async function waitFor(cond: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("waitFor timed out");
    await Bun.sleep(10);
  }
}

function followup(n: number, text: string) {
  writeFileSync(join(paths.runDir, `FOLLOWUP-${n}.md`), text);
}

describe("FollowUpInbox", () => {
  test("T1: follow-up after a DONE turn archives the report, sends the prompt with the report path, and marks the file sent", async () => {
    const ch = await open();
    writeFileSync(paths.report, "DONE\nold");
    await ch.request("session/prompt", { sessionId: SESSION, prompt: [{ type: "text", text: "turn 1" }] });
    const inbox = runFollowupInbox({ paths, channel: ch, sessionId: SESSION });
    followup(1, "do X");
    await waitFor(() => promptTexts().length === 2);
    await inbox;

    expect(promptTexts()[1]).toContain("do X");
    expect(promptTexts()[1]).toContain(paths.report);
    expect(readFileSync(join(paths.runDir, "REPORT.prev-1.md"), "utf8")).toBe("DONE\nold");
    expect(existsSync(paths.report)).toBe(false);
    expect(existsSync(join(paths.runDir, "FOLLOWUP-1.sent.md"))).toBe(true);
    expect(existsSync(join(paths.runDir, "FOLLOWUP-1.md"))).toBe(false);
  });

  test("T2: follow-ups written mid-turn are sent in numeric order (9 before 10)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const started: string[] = [];
    const ch = await open((c) => ({
      ...c,
      request: async (method, params) => {
        if (method === "session/prompt") {
          started.push(method);
          await gate;
        }
        return c.request(method, params);
      },
    }));
    followup(9, "nine");
    const inbox = runFollowupInbox({ paths, channel: ch, sessionId: SESSION });
    await waitFor(() => started.length === 1);
    followup(10, "ten");
    release();
    await waitFor(() => promptTexts().length === 2);
    await inbox;

    expect(promptTexts()[0]).toContain("nine");
    expect(promptTexts()[1]).toContain("ten");
  });

  test("T3: with MUSTER_IDLE_TIMEOUT_MS=300 and no follow-up the inbox exits with phase exited (idle-timeout) and keeps the DONE report", async () => {
    process.env.MUSTER_IDLE_TIMEOUT_MS = "300";
    const ch = await open();
    writeFileSync(paths.report, "DONE\nfinished");
    await runFollowupInbox({ paths, channel: ch, sessionId: SESSION });

    const phase = readPhase(paths);
    expect(phase?.phase).toBe("exited");
    expect(String(phase?.reason)).toContain("idle-timeout");
    expect(readFileSync(paths.report, "utf8")).toBe("DONE\nfinished");
  });

  test("T4: with MUSTER_IDLE_TIMEOUT_MS unset the idle timeout is 900000", () => {
    delete process.env.MUSTER_IDLE_TIMEOUT_MS;
    expect(idleTimeoutMs()).toBe(900000);
  });

  test("T5: an empty follow-up is marked sent, sends no prompt, and logs a client-decision warning", async () => {
    const ch = await open();
    followup(1, "");
    const inbox = runFollowupInbox({ paths, channel: ch, sessionId: SESSION });
    await waitFor(() => existsSync(join(paths.runDir, "FOLLOWUP-1.sent.md")));
    await inbox;

    expect(promptTexts()).toHaveLength(0);
    const decisions = events().filter((e) => e.dir === "client-decision");
    expect(decisions).toHaveLength(1);
    expect(decisions[0].msg.level).toBe("warn");
  });

  test("T6: a follow-up written while phase is question is not sent until the question is answered and the turn ends", async () => {
    const ch = await open();
    const inbox = runFollowupInbox({ paths, channel: ch, sessionId: SESSION });
    writePhase(paths, { phase: "question" });
    followup(1, "do Y");
    await Bun.sleep(100);
    expect(promptTexts()).toHaveLength(0);

    writePhase(paths, { phase: "idle" });
    await waitFor(() => promptTexts().length === 1);
    await inbox;
    expect(promptTexts()[0]).toContain("do Y");
  });
});
