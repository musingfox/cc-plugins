import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { LaunchError, openChannel, type Channel } from "../src/channel";

const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const RUNS = join(import.meta.dir, "..", ".test-runs");

let dir: string;
let channels: Channel[] = [];

beforeEach(() => {
  mkdirSync(RUNS, { recursive: true });
  dir = mkdtempSync(join(RUNS, "channel-"));
});

afterEach(async () => {
  for (const c of channels) await c.close();
  channels = [];
  rmSync(dir, { recursive: true, force: true });
});

function paths() {
  return { eventsPath: join(dir, "events.jsonl"), stderrPath: join(dir, "stderr.log") };
}

async function open(scenario: object = {}) {
  const p = paths();
  const ch = await openChannel({
    argv: [process.execPath, FAKE],
    env: { FAKE_AGENT_SCENARIO: JSON.stringify(scenario) },
    ...p,
  });
  channels.push(ch);
  return { ch, ...p };
}

function events(path: string) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { t: string; dir: string; msg: any });
}

describe("AcpEventLog", () => {
  test("T1: records 3 out and 4 in lines in arrival order with non-decreasing ISO timestamps", async () => {
    const { ch, eventsPath } = await open({
      startup: [{ jsonrpc: "2.0", method: "session/update", params: {} }],
    });
    await ch.request("a", { n: 1 });
    await ch.request("b", { n: 2 });
    await ch.request("c", { n: 3 });

    const ev = events(eventsPath);
    expect(ev.filter((e) => e.dir === "out")).toHaveLength(3);
    expect(ev.filter((e) => e.dir === "in")).toHaveLength(4);
    for (const e of ev) {
      expect(e.t).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    for (let i = 1; i < ev.length; i++) {
      expect(ev[i].t >= ev[i - 1].t).toBe(true);
    }
  });

  test("T2: non-JSON stdout line is logged as in-raw and the channel keeps working", async () => {
    const { ch, eventsPath } = await open({ startup: ["garbage{"] });
    const result = await ch.request("ping", {});
    expect(result).toEqual({ echo: {} });

    const raw = events(eventsPath).filter((e) => e.dir === "in-raw");
    expect(raw).toHaveLength(1);
    expect(raw[0].msg).toBe("garbage{");
  });

  test("T3: stderr goes to stderr.log only, not to events.jsonl", async () => {
    const { ch, eventsPath, stderrPath } = await open({ stderr: "boom\n" });
    await ch.request("ping", {});
    expect(readFileSync(stderrPath, "utf8")).toContain("boom");
    expect(readFileSync(eventsPath, "utf8")).not.toContain("boom");
  });

  test("T4: a param string containing a newline yields events lines that each parse as JSON", async () => {
    const { ch, eventsPath } = await open();
    await ch.request("fake/echo", { text: "a\nb" });

    const lines = readFileSync(eventsPath, "utf8").split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed[0].msg.params.text).toBe("a\nb");
  });

  test("T5: a missing binary rejects openChannel with LaunchError", async () => {
    const p = paths();
    await expect(openChannel({ argv: ["/no/such/binary"], ...p })).rejects.toBeInstanceOf(
      LaunchError,
    );
  });

  test("T6: two concurrent requests answered out of order each resolve with their own result", async () => {
    const { ch } = await open();
    const [a, b] = await Promise.all([
      ch.request("fake/echo", { tag: "a", delayMs: 120 }),
      ch.request("fake/echo", { tag: "b", delayMs: 0 }),
    ]);
    expect((a as any).echo.tag).toBe("a");
    expect((b as any).echo.tag).toBe("b");
  });
});

describe("ChannelNotificationObserver", () => {
  const emit = (ch: Channel, messages: object[]) => ch.request("fake/emit", { messages });
  const note = (n: number) => ({ jsonrpc: "2.0", method: "session/update", params: { n } });

  test("T1: a handler gets each notification's params in arrival order, after its line is recorded", async () => {
    const { ch, eventsPath } = await open();
    const seen: unknown[] = [];
    const lines: number[] = [];
    ch.onNotification("session/update", (params) => {
      seen.push(params);
      lines.push(events(eventsPath).filter((e) => e.dir === "in" && e.msg.method === "session/update").length);
    });
    await emit(ch, [note(1), note(2)]);
    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
    expect(lines).toEqual([1, 2]);
  });

  test("T2: a handler that throws does not stop later notifications or later requests", async () => {
    const { ch, eventsPath } = await open();
    const seen: unknown[] = [];
    ch.onNotification("session/update", (params) => {
      seen.push(params);
      if ((params as { n: number }).n === 1) throw new Error("boom");
    });
    await emit(ch, [note(1), note(2)]);
    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
    expect(events(eventsPath).filter((e) => e.dir === "in" && e.msg.method === "session/update").length).toBe(2);
    await expect(ch.request("fake/echo", { tag: "after" })).resolves.toBeDefined();
  });

  test("T3: a handler that rejects is swallowed and later notifications arrive", async () => {
    const { ch } = await open();
    const seen: unknown[] = [];
    ch.onNotification("session/update", async (params) => {
      seen.push(params);
      if ((params as { n: number }).n === 1) throw new Error("rejected");
    });
    await emit(ch, [note(1), note(2)]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
  });

  test("T4: a request with an id never reaches the notification handler", async () => {
    const { ch } = await open();
    const seen: unknown[] = [];
    ch.onNotification("session/update", (params) => {
      seen.push(params);
    });
    await emit(ch, [{ jsonrpc: "2.0", id: 9, method: "session/update", params: { n: 9 } }]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toEqual([]);
  });

  test("T5: a notification with no handler is recorded and nothing else happens", async () => {
    const { ch, eventsPath } = await open();
    await emit(ch, [note(1)]);
    const inbound = events(eventsPath).filter((e) => e.dir === "in" && e.msg.method === "session/update");
    expect(inbound.map((e) => e.msg.params)).toEqual([{ n: 1 }]);
  });
});
