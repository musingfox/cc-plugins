import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRunDir, runPaths, type RunPaths } from "../src/layout";
import { createProgressWriter } from "../src/progress";

const RUNS = join(import.meta.dir, "..", ".test-runs");

let home: string;
let layout: RunPaths;

beforeEach(() => {
  mkdirSync(RUNS, { recursive: true });
  home = mkdtempSync(join(RUNS, "progress-"));
  layout = runPaths("r1", { MUSTER_HOME: home, HOME: home });
  createRunDir(layout);
  writeFileSync(layout.phase, JSON.stringify({ phase: "starting", pid: 7 }));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const phaseOf = () => JSON.parse(readFileSync(layout.phase, "utf8"));
const update = (u: unknown) => ({ sessionId: "s", update: u });
const plan = (...statuses: string[]) => ({ sessionUpdate: "plan", entries: statuses.map((status) => ({ content: "x", priority: "medium", status })) });

test("creation keeps the phase keys and adds the ticket title and zero tools", () => {
  createProgressWriter(layout, "# Fix login\nmore");
  expect(phaseOf()).toEqual({ phase: "starting", pid: 7, title: "Fix login", tools: 0 });
});

test("a plan update adds the plan and keeps the title", () => {
  const observe = createProgressWriter(layout, "# Fix login\nmore");
  observe(update(plan("completed", "in_progress", "pending")));
  expect(phaseOf()).toEqual({ phase: "starting", pid: 7, title: "Fix login", tools: 0, plan: { done: 1, total: 3 } });
});

test("each tool call bumps the tool count", () => {
  const observe = createProgressWriter(layout, "T");
  for (let i = 0; i < 3; i++) observe(update({ sessionUpdate: "tool_call", toolCallId: `t${i}` }));
  expect(phaseOf().tools).toBe(3);
});

test("a real session title replaces the ticket title and a usage cost is recorded", () => {
  const observe = createProgressWriter(layout, "Ticket");
  observe(update({ sessionUpdate: "session_info_update", title: "Real title" }));
  observe(update({ sessionUpdate: "usage_update", size: 1, used: 1, cost: { amount: 0.5, currency: "USD" } }));
  expect(phaseOf()).toMatchObject({ title: "Real title", cost: 0.5 });
});

test("params that are not a session update leave the phase unchanged", () => {
  const observe = createProgressWriter(layout, "T");
  const before = readFileSync(layout.phase, "utf8");
  observe(update({ sessionUpdate: "agent_message_chunk" }));
  observe("junk");
  expect(readFileSync(layout.phase, "utf8")).toBe(before);
  expect(existsSync(layout.phase)).toBe(true);
});
