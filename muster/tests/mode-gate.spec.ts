import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { openChannel, type Channel } from "../src/channel";
import { ModeRefused, enforceDefaultMode } from "../src/mode-gate";

const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const RUNS = join(import.meta.dir, "..", ".test-runs");
const SESSION_ID = "sess-1";

const modeOptions = (currentValue: string) => [
  { id: "model", category: "model", currentValue: "opus" },
  { id: "mode", category: "mode", currentValue, options: ["default", "auto"] },
];

let dir: string;
let channels: Channel[] = [];

beforeEach(() => {
  mkdirSync(RUNS, { recursive: true });
  dir = mkdtempSync(join(RUNS, "mode-gate-"));
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

function outLines(path: string) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; msg: any })
    .filter((e) => e.dir === "out")
    .map((e) => e.msg);
}

describe("ModeGate", () => {
  test("T1: initial mode auto is set to default, one set_config_option, response confirms", async () => {
    const { ch, eventsPath } = await open({
      results: { "session/set_config_option": { configOptions: modeOptions("default") } },
    });
    await enforceDefaultMode(ch, { configOptions: modeOptions("auto"), sessionId: SESSION_ID });
    const sent = outLines(eventsPath).filter((m) => m.method === "session/set_config_option");
    expect(sent.length).toBe(1);
    expect(sent[0].params).toStrictEqual({ sessionId: SESSION_ID, configId: "mode", value: "default" });
  });

  test("T2: initial mode already default still sends the request (count 1)", async () => {
    const { ch, eventsPath } = await open({
      results: { "session/set_config_option": { configOptions: modeOptions("default") } },
    });
    await enforceDefaultMode(ch, { configOptions: modeOptions("default"), sessionId: SESSION_ID });
    const sent = outLines(eventsPath).filter((m) => m.method === "session/set_config_option");
    expect(sent.length).toBe(1);
  });

  test("T3: JSON-RPC error rejects ModeRefused and no session/prompt is sent", async () => {
    const { ch, eventsPath } = await open({
      errors: { "session/set_config_option": "refused" },
    });
    await expect(
      enforceDefaultMode(ch, { configOptions: modeOptions("auto"), sessionId: SESSION_ID }),
    ).rejects.toBeInstanceOf(ModeRefused);
    expect(outLines(eventsPath).some((m) => m.method === "session/prompt")).toBe(false);
  });

  test("T4: response mode currentValue auto rejects ModeRefused", async () => {
    const { ch } = await open({
      results: { "session/set_config_option": { configOptions: modeOptions("auto") } },
    });
    await expect(
      enforceDefaultMode(ch, { configOptions: modeOptions("auto"), sessionId: SESSION_ID }),
    ).rejects.toBeInstanceOf(ModeRefused);
  });

  test("T4b: no mode-category option rejects ModeRefused without sending a request", async () => {
    const { ch, eventsPath } = await open({});
    await expect(
      enforceDefaultMode(ch, { configOptions: [{ id: "model", category: "model" }], sessionId: SESSION_ID }),
    ).rejects.toBeInstanceOf(ModeRefused);
    expect(outLines(eventsPath).some((m) => m.method === "session/set_config_option")).toBe(false);
  });

  test("T5: set_config_option line precedes the first session/prompt line in the full sequence", async () => {
    const { ch, eventsPath } = await open({
      results: { "session/set_config_option": { configOptions: modeOptions("default") } },
    });
    await enforceDefaultMode(ch, { configOptions: modeOptions("auto"), sessionId: SESSION_ID });
    await ch.request("session/prompt", { sessionId: SESSION_ID, prompt: [] });
    const methods = outLines(eventsPath).map((m) => m.method);
    const setIdx = methods.indexOf("session/set_config_option");
    const promptIdx = methods.indexOf("session/prompt");
    expect(setIdx).toBeGreaterThanOrEqual(0);
    expect(setIdx).toBeLessThan(promptIdx);
  });
});
