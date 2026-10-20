import { describe, expect, test } from "bun:test";
import * as bashPolicy from "../src/bash-policy";
import { decideBash } from "../src/bash-policy";

type Case = { name: string; command: unknown; expectAllow: boolean };

const DENY_REASON = "bash is confined by the OS sandbox; a request that reaches the client is escalated";

const table: Case[] = [
  // T1
  { name: "T1 compound chain", command: "git status; ls src; bun test; echo hi > bash-ok.txt; echo ok > f.txt; echo \"exit=$?\"; cd / && rm -rf x", expectAllow: true },
  { name: "T1 git status", command: "git status", expectAllow: true },
  { name: "T1 ls src", command: "ls src", expectAllow: true },
  { name: "T1 bun test", command: "bun test", expectAllow: true },
  { name: "T1 exit status", command: 'echo "exit=$?"', expectAllow: true },
  { name: "T1 cd and rm chain", command: "cd / && rm -rf x", expectAllow: true },
  // T2
  { name: "T2 undefined", command: undefined, expectAllow: false },
  { name: "T2 number", command: 42, expectAllow: false },
  { name: "T2 empty string", command: "", expectAllow: false },
  { name: "T2 object", command: {}, expectAllow: false },
];

function failuresFor(decide: (command: unknown) => { allow: boolean }): string[] {
  const failures: string[] = [];
  for (const c of table) {
    let got: { allow: boolean };
    try {
      got = decide(c.command);
    } catch {
      failures.push(`${c.name}: threw instead of returning a decision`);
      continue;
    }
    if (got.allow !== c.expectAllow) {
      failures.push(`${c.name}: expected allow=${c.expectAllow}, got allow=${got.allow}`);
    }
  }
  return failures;
}

describe("decideBash", () => {
  test("T1/T2: every non-empty string command is allowed; other inputs are denied", () => {
    expect(failuresFor((command) => decideBash(command, { worktreeReal: "/tmp" }))).toEqual([]);
  });

  test("T3: every reason names the OS sandbox", () => {
    for (const c of table) {
      const d = decideBash(c.command);
      expect(d.reason).toContain("sandbox");
    }
    const allowed = decideBash("git status");
    expect(allowed.allow).toBe(true);
    expect(allowed.reason).toContain("bash runs inside the OS sandbox");
    const denied = decideBash("");
    expect(denied.allow).toBe(false);
    expect(denied.reason).toBe(DENY_REASON);
  });

  test("T4: the decision table reports failures against a deliberately broken () => ({allow:false}) guard", () => {
    expect(failuresFor(() => ({ allow: false })).length).toBeGreaterThan(0);
  });

  test("T5: the module exports only decideBash", () => {
    expect(Object.keys(bashPolicy)).toEqual(["decideBash"]);
  });
});
