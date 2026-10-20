import { expect, test } from "bun:test";
import { foldPlan } from "../src/progress";

const plan = (...statuses: unknown[]) => ({ sessionUpdate: "plan", entries: statuses.map((status) => ({ content: "step", priority: "medium", status })) });
const FROM = { done: 1, total: 3 };

test("a plan update counts its completed entries out of all entries", () => {
  expect(foldPlan(null, plan("completed", "in_progress", "pending"))).toEqual({ done: 1, total: 3 });
});

test("a later plan replaces the earlier count instead of adding to it", () => {
  expect(foldPlan({ done: 1, total: 3 }, plan("completed", "completed", "completed", "pending"))).toEqual({ done: 3, total: 4 });
});

test("an entry with an unknown status counts in the total only", () => {
  expect(foldPlan(null, plan("weird", "completed"))).toEqual({ done: 1, total: 2 });
});

test("an empty plan gives zero of zero", () => {
  expect(foldPlan({ done: 1, total: 3 }, plan())).toEqual({ done: 0, total: 0 });
});

test("updates that carry no plan entries leave the previous count as the same object", () => {
  const prev = { done: 1, total: 3 };
  expect(foldPlan(prev, { sessionUpdate: "plan", entries: "x" })).toBe(prev);
  expect(foldPlan(prev, null)).toBe(prev);
  expect(foldPlan(prev, 42)).toBe(prev);
  expect(foldPlan(prev, { sessionUpdate: "tool_call", toolCallId: "t1" })).toBe(prev);
});
