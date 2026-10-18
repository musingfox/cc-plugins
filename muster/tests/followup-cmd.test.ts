import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunDir, runPaths, writePhase, type RunPaths } from "../src/layout";
import { followupVerb } from "../src/verbs/followup";

let home: string;
let scratch: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "muster-followup-"));
  scratch = mkdtempSync(join(tmpdir(), "muster-followup-src-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});

function env() {
  return { MUSTER_HOME: home, HOME: home };
}

function makeRun(phase: Record<string, unknown> = { phase: "running", pid: process.pid }): RunPaths {
  const p = runPaths("a1", env());
  createRunDir(p);
  writeFileSync(p.meta, JSON.stringify({ name: "a1" }));
  writePhase(p, phase);
  return p;
}

describe("FollowUpCommand", () => {
  test("T1: first follow-up writes FOLLOWUP-1.md and prints queued line", () => {
    const p = makeRun();
    const r = followupVerb("a1", "do X", env());
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("queued a1 followup=1\n");
    expect(readFileSync(join(p.runDir, "FOLLOWUP-1.md"), "utf8")).toBe("do X");
  });

  test("T2: next number is 1 + highest of FOLLOWUP-<n>.md and FOLLOWUP-<n>.sent.md", () => {
    const p = makeRun();
    writeFileSync(join(p.runDir, "FOLLOWUP-1.sent.md"), "old");
    writeFileSync(join(p.runDir, "FOLLOWUP-2.md"), "pending");
    const r = followupVerb("a1", "next", env());
    expect(r.stdout).toBe("queued a1 followup=3\n");
    expect(readFileSync(join(p.runDir, "FOLLOWUP-3.md"), "utf8")).toBe("next");
  });

  test("T3: --file copies the file bytes verbatim", () => {
    const p = makeRun();
    const src = join(scratch, "notes.md");
    const bytes = "line one\n\n  indented 中文\n";
    writeFileSync(src, bytes);
    const r = followupVerb("a1", { file: src }, env());
    expect(r.exitCode).toBe(0);
    expect(readFileSync(join(p.runDir, "FOLLOWUP-1.md"), "utf8")).toBe(bytes);
  });

  test("T4: empty text exits 2 and writes no file", () => {
    const p = makeRun();
    const r = followupVerb("a1", "   ", env());
    expect(r.exitCode).toBe(2);
    expect(existsSync(join(p.runDir, "FOLLOWUP-1.md"))).toBe(false);
  });

  test("T5: exited phase exits 1 with 'client exited' and writes no file", () => {
    const p = makeRun({ phase: "exited", pid: 999999 });
    const r = followupVerb("a1", "do X", env());
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("client exited");
    expect(existsSync(join(p.runDir, "FOLLOWUP-1.md"))).toBe(false);
  });

  test("T6: unknown run exits 1 with 'no such run'", () => {
    const r = followupVerb("zz", "do X", env());
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("no such run");
  });
});
