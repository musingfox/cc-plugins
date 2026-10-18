import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { openChannel, type Channel } from "../src/channel";
import { HandshakeError, assertAdapterVersion, handshake } from "../src/handshake";

const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const RUNS = join(import.meta.dir, "..", ".test-runs");

let dir: string;
let channels: Channel[] = [];

beforeEach(() => {
  mkdirSync(RUNS, { recursive: true });
  dir = mkdtempSync(join(RUNS, "version-gate-"));
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

function outMethods(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; msg: any })
    .filter((e) => e.dir === "out")
    .map((e) => e.msg.method);
}

const withVersion = (version: string) => ({
  results: { initialize: { agentInfo: { name: "claude-agent-acp", version } } },
});

describe("AdapterVersionGate", () => {
  test("T1: adapter version 0.93.0 is accepted", () => {
    expect(() => assertAdapterVersion({ name: "claude-agent-acp", version: "0.93.0" })).not.toThrow();
  });

  test("T2: adapter 0.94.0 is refused with the mismatch message and no session/prompt is sent", async () => {
    const { ch, eventsPath } = await open(withVersion("0.94.0"));
    const err = await handshake(ch, { worktree: "/tmp/w" }).catch((e) => e);
    expect(err).toBeInstanceOf(HandshakeError);
    expect(err.message).toContain("adapter-version-mismatch");
    expect(err.message).toContain("0.94.0");
    expect(outMethods(eventsPath)).not.toContain("session/prompt");
  });

  test("T3: '0.93.0-beta' and ' 0.93.0' are refused (exact comparison)", () => {
    expect(() => assertAdapterVersion({ version: "0.93.0-beta" })).toThrow(HandshakeError);
    expect(() => assertAdapterVersion({ version: " 0.93.0" })).toThrow(HandshakeError);
  });

  test("T4: agentInfo absent is refused with 'got none'", async () => {
    const { ch } = await open({});
    const err = await handshake(ch, { worktree: "/tmp/w" }).catch((e) => e);
    expect(err).toBeInstanceOf(HandshakeError);
    expect(err.message).toContain("got none");
  });
});
