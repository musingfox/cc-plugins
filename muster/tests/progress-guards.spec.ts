import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRunDir, runPaths, type RunPaths } from "../src/layout";
import { createProgressWriter } from "../src/progress";

const RUNS = join(import.meta.dir, "..", ".test-runs");

let home: string;
let layout: RunPaths;

beforeEach(() => {
  mkdirSync(RUNS, { recursive: true });
  home = mkdtempSync(join(RUNS, "guards-"));
  layout = runPaths("r1", { MUSTER_HOME: home, HOME: home });
  createRunDir(layout);
  writeFileSync(layout.phase, JSON.stringify({ phase: "idle", pid: 7 }));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const update = (u: unknown) => ({ sessionId: "s", update: u });
const plan = (...statuses: string[]) => ({ sessionUpdate: "plan", entries: statuses.map((status) => ({ content: "x", priority: "medium", status })) });

test("an unchanged figure leaves the file untouched and a changed one rewrites it", () => {
  const observe = createProgressWriter(layout, "T");
  observe(update(plan("completed", "pending")));
  const first = statSync(layout.phase);
  const bytes = readFileSync(layout.phase, "utf8");
  observe(update(plan("completed", "pending")));
  expect(statSync(layout.phase).ino).toBe(first.ino);
  expect(readFileSync(layout.phase, "utf8")).toBe(bytes);
  observe(update(plan("completed", "completed")));
  expect(statSync(layout.phase).ino).not.toBe(first.ino);
});

test("an exited run's phase file stays byte-identical to what termination wrote", () => {
  const observe = createProgressWriter(layout, "T");
  writeFileSync(layout.phase, JSON.stringify({ phase: "exited", pid: 7, title: "T", tools: 0 }));
  const bytes = readFileSync(layout.phase, "utf8");
  observe({ sessionId: "s", update: { sessionUpdate: "tool_call", toolCallId: "t1" } });
  observe({ sessionId: "s", update: { sessionUpdate: "usage_update", size: 1, used: 1, cost: { amount: 2, currency: "USD" } } });
  expect(readFileSync(layout.phase, "utf8")).toBe(bytes);
});

test("a run directory removed under the writer does not throw", () => {
  const observe = createProgressWriter(layout, "T");
  rmSync(layout.runDir, { recursive: true, force: true });
  expect(() => observe(update(plan("completed")))).not.toThrow();
});

test("a changed figure on an idle run is written", () => {
  const observe = createProgressWriter(layout, "T");
  observe(update(plan("completed", "pending")));
  expect(JSON.parse(readFileSync(layout.phase, "utf8")).plan).toEqual({ done: 1, total: 2 });
});
