import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { openChannel, type Channel } from "../src/channel";

const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const RUNS = join(import.meta.dir, "..", ".test-runs");

let dir: string;
let channels: Channel[] = [];

beforeEach(() => {
  mkdirSync(RUNS, { recursive: true });
  dir = mkdtempSync(join(RUNS, "unsupported-"));
});

afterEach(async () => {
  for (const c of channels) await c.close();
  channels = [];
  rmSync(dir, { recursive: true, force: true });
});

async function open(scenario: object) {
  const eventsPath = join(dir, "events.jsonl");
  const ch = await openChannel({
    argv: [process.execPath, FAKE],
    env: { FAKE_AGENT_SCENARIO: JSON.stringify(scenario) },
    eventsPath,
    stderrPath: join(dir, "stderr.log"),
  });
  channels.push(ch);
  return { ch, eventsPath };
}

function outs(path: string) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; msg: any })
    .filter((e) => e.dir === "out")
    .map((e) => e.msg);
}

describe("UnsupportedRequestReply", () => {
  test("T1: an inbound request with no handler gets a -32601 reply carrying its id", async () => {
    const { ch, eventsPath } = await open({
      startup: [{ jsonrpc: "2.0", id: 7, method: "fs/read_text_file", params: {} }],
    });
    await ch.request("fake/echo", {});

    const replies = outs(eventsPath).filter((m) => m.error?.code === -32601);
    expect(replies).toHaveLength(1);
    expect(replies[0].id).toBe(7);
    expect(replies[0].error.message).toBe("method not supported: fs/read_text_file");
  });

  test("T2: a string id is echoed back in the refusal", async () => {
    const { ch, eventsPath } = await open({
      startup: [{ jsonrpc: "2.0", id: "a1", method: "fs/read_text_file", params: {} }],
    });
    await ch.request("fake/echo", {});

    const replies = outs(eventsPath).filter((m) => m.error?.code === -32601);
    expect(replies).toHaveLength(1);
    expect(replies[0].id).toBe("a1");
  });

  test("T3: an inbound notification with no handler gets no reply", async () => {
    const { ch, eventsPath } = await open({
      startup: [{ jsonrpc: "2.0", method: "session/update", params: {} }],
    });
    await ch.request("fake/echo", {});

    // The only out line allowed is the request muster sent itself; any reply would have no method.
    const sent = outs(eventsPath);
    expect(sent.every((m) => m.method !== undefined)).toBe(true);
  });

  test("T4: a registered handler for session/request_permission is not refused with -32601", async () => {
    const { ch, eventsPath } = await open({});
    ch.onRequest("session/request_permission", () => ({
      outcome: { outcome: "selected", optionId: "allow_once" },
    }));
    await ch.request("fake/emit", {
      messages: [{ jsonrpc: "2.0", id: 9, method: "session/request_permission", params: {} }],
    });

    const replies = outs(eventsPath).filter((m) => m.id === 9);
    expect(replies).toHaveLength(1);
    expect(replies[0].error).toBeUndefined();
    expect(replies[0].result.outcome.optionId).toBe("allow_once");
  });
});
