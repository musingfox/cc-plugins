import { describe, expect, test } from "bun:test";
import { chooseOutcome, type PermissionOption } from "../src/outcome";

const allowOnce: PermissionOption = { optionId: "allow-once", kind: "allow_once", name: "Allow" };
const allowAlways: PermissionOption = { optionId: "allow-with-updates", kind: "allow_always", name: "Always allow" };
const rejectOnce: PermissionOption = { optionId: "reject", kind: "reject_once", name: "Reject" };
const rejectAlways: PermissionOption = { optionId: "reject-always", kind: "reject_always", name: "Always reject" };

type Chooser = (options: PermissionOption[], decision: "allow" | "deny") => unknown;

// Runs a table of cases against a chooser and returns the names of the failing cases.
function runTable(
  chooser: Chooser,
  cases: { name: string; options: PermissionOption[]; decision: "allow" | "deny"; expected: unknown }[],
): string[] {
  return cases
    .filter((c) => JSON.stringify(chooser(c.options, c.decision)) !== JSON.stringify(c.expected))
    .map((c) => c.name);
}

describe("chooseOutcome", () => {
  test("T1: allow picks allow_once and deny picks reject_once, never the always options", () => {
    const options = [allowOnce, allowAlways, rejectOnce];
    expect(chooseOutcome(options, "allow")).toEqual({ outcome: "selected", optionId: "allow-once" });
    expect(chooseOutcome(options, "deny")).toEqual({ outcome: "selected", optionId: "reject" });
  });

  test("T2: an allow_always listed before allow_once does not win", () => {
    expect(chooseOutcome([allowAlways, allowOnce], "allow")).toEqual({
      outcome: "selected",
      optionId: "allow-once",
    });
  });

  test("T3: only allow_always and reject_once listed, allow is cancelled", () => {
    expect(chooseOutcome([allowAlways, rejectOnce], "allow")).toEqual({ outcome: "cancelled" });
  });

  test("T4: no options at all is cancelled", () => {
    expect(chooseOutcome([], "allow")).toEqual({ outcome: "cancelled" });
    expect(chooseOutcome([], "deny")).toEqual({ outcome: "cancelled" });
  });

  test("T5: the table harness catches a broken chooser that returns options[0]", () => {
    const broken: Chooser = (options) => ({ outcome: "selected", optionId: options[0]?.optionId });
    const cases = [
      {
        name: "allow with always first",
        options: [allowAlways, allowOnce],
        decision: "allow" as const,
        expected: { outcome: "selected", optionId: "allow-once" },
      },
      {
        name: "deny with always first",
        options: [rejectAlways, rejectOnce],
        decision: "deny" as const,
        expected: { outcome: "selected", optionId: "reject" },
      },
    ];
    expect(runTable(broken, cases).length).toBeGreaterThan(0);
    expect(runTable(chooseOutcome, cases)).toEqual([]);
  });
});
