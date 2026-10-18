import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { openChannel, type Channel } from "../src/channel";
import { ModelRefused, gateModel } from "../src/model-gate";

const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const RUNS = join(import.meta.dir, "..", ".test-runs");

let dir: string;
let channels: Channel[] = [];

beforeEach(() => {
  mkdirSync(RUNS, { recursive: true });
  dir = mkdtempSync(join(RUNS, "model-gate-"));
});

afterEach(async () => {
  for (const c of channels) await c.close();
  channels = [];
  rmSync(dir, { recursive: true, force: true });
});

function modelOption(currentValue: string, options: unknown[]) {
  return { id: "model", category: "model", currentValue, options };
}

async function open(scenario: object = {}) {
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
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; msg: any })
    .filter((e) => e.dir === "out")
    .map((e) => e.msg.method);
}

function outMessages(path: string) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; msg: any })
    .filter((e) => e.dir === "out")
    .map((e) => e.msg);
}

const twoModels = [
  { id: "model", category: "model", currentValue: "haiku", options: [{ value: "haiku" }, { value: "sonnet" }] },
];

describe("ModelGate", () => {
  test("T1: requested haiku sends one set_config_option with the model configId and value haiku", async () => {
    const { ch, eventsPath } = await open({
      results: {
        "session/set_config_option": {
          configOptions: [modelOption("haiku", [{ value: "haiku" }, { value: "sonnet" }])],
        },
      },
    });
    await gateModel(ch, { sessionId: "s1", configOptions: twoModels, requestedModel: "haiku" });
    const sent = outMessages(eventsPath).filter((m) => m.method === "session/set_config_option");
    expect(sent.length).toBe(1);
    expect(sent[0].params).toStrictEqual({ sessionId: "s1", configId: "model", value: "haiku" });
  });

  test("T2: requested gpt-9 rejects with ModelRefused listing haiku and sonnet and sends nothing", async () => {
    const { ch, eventsPath } = await open();
    const err = await gateModel(ch, { sessionId: "s1", configOptions: twoModels, requestedModel: "gpt-9" }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ModelRefused);
    expect(err.message).toContain("haiku");
    expect(err.message).toContain("sonnet");
    const methods = outMethods(eventsPath);
    expect(methods).not.toContain("session/set_config_option");
    expect(methods).not.toContain("session/prompt");
  });

  test("T3: requested 'Haiku' or 'hai' is refused because matching is exact", async () => {
    for (const requestedModel of ["Haiku", "hai"]) {
      const { ch, eventsPath } = await open();
      const err = await gateModel(ch, { sessionId: "s1", configOptions: twoModels, requestedModel }).catch((e) => e);
      expect(err).toBeInstanceOf(ModelRefused);
      expect(outMethods(eventsPath)).not.toContain("session/set_config_option");
    }
  });

  test("T4: a model inside a grouped option is accepted", async () => {
    const grouped = [
      {
        id: "model",
        category: "model",
        currentValue: "opus",
        options: [{ group: "g", name: "G", options: [{ value: "opus" }] }],
      },
    ];
    const { ch, eventsPath } = await open({
      results: { "session/set_config_option": { configOptions: grouped } },
    });
    await gateModel(ch, { sessionId: "s1", configOptions: grouped, requestedModel: "opus" });
    expect(outMethods(eventsPath)).toContain("session/set_config_option");
  });

  test("T5: a response whose model currentValue is 'default' rejects with ModelRefused", async () => {
    const { ch } = await open({
      results: {
        "session/set_config_option": {
          configOptions: [modelOption("default", [{ value: "haiku" }, { value: "sonnet" }])],
        },
      },
    });
    const err = await gateModel(ch, { sessionId: "s1", configOptions: twoModels, requestedModel: "haiku" }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ModelRefused);
  });

  test("T6: no model-category option rejects with ModelRefused and sends nothing", async () => {
    const { ch, eventsPath } = await open();
    const noModel = [{ id: "mode", category: "mode", currentValue: "default", options: [{ value: "default" }] }];
    const err = await gateModel(ch, { sessionId: "s1", configOptions: noModel, requestedModel: "haiku" }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ModelRefused);
    expect(outMethods(eventsPath)).not.toContain("session/set_config_option");
  });
});
