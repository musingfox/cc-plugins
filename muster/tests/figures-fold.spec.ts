import { expect, test } from "bun:test";
import { foldFigures } from "../src/progress";

const START = { title: "Fix bug", tools: 0, cost: null };
const info = (title: unknown) => ({ sessionUpdate: "session_info_update", title });
const usage = (cost: unknown) => ({ sessionUpdate: "usage_update", size: 1000, used: 10, cost });

test("a session info title replaces the title", () => {
  expect(foldFigures(START, info("Onboarding feed")).title).toBe("Onboarding feed");
});

test("a blank or non-string session info title leaves the figures as the same object", () => {
  for (const title of ["", "   ", null, 7]) expect(foldFigures(START, info(title))).toBe(START);
});

test("each tool call adds one and a tool call update does not", () => {
  const twoCalls = foldFigures(foldFigures(START, { sessionUpdate: "tool_call", toolCallId: "a" }), { sessionUpdate: "tool_call", toolCallId: "b" });
  expect(twoCalls.tools).toBe(2);
  expect(foldFigures(twoCalls, { sessionUpdate: "tool_call_update", toolCallId: "a" })).toBe(twoCalls);
});

test("a usage update with a finite cost amount sets the cost and others leave it", () => {
  const withCost = foldFigures(START, usage({ amount: 5.7291, currency: "USD" }));
  expect(withCost.cost).toBe(5.7291);
  const noCost = foldFigures(withCost, usage(undefined));
  expect(noCost).toBe(withCost);
  expect(foldFigures(noCost, usage({ amount: "x" }))).toBe(noCost);
});
