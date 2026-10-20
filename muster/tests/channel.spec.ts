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
