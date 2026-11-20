import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

function makeRun(phase: Record<string, unknown> = { phase: "exited", pid: 999999, sessionId: "sess-1" }): RunPaths {
  const p = runPaths("a1", env());
  createRunDir(p);
  writeFileSync(p.meta, JSON.stringify({ name: "a1", model: "m", repoRoot: home, worktree: home, branch: "muster/a1" }));
  writePhase(p, phase);
  return p;
}

describe("FollowUpCommand", () => {
  test("T4: empty text exits 2 and leaves the run directory as it was", async () => {
    const p = makeRun();
    const r = await followupVerb("a1", "   ", env());
    expect(r.exitCode).toBe(2);
    expect(readdirSync(p.runDir).sort()).toEqual(["meta.json", "phase.json"]);
  });

  test("R1: empty --file content exits 2 and leaves the run directory as it was", async () => {
    const p = makeRun();
    const src = join(scratch, "empty.md");
    writeFileSync(src, "");
    const r = await followupVerb("a1", { file: src }, env());
    expect(r.exitCode).toBe(2);
    expect(readdirSync(p.runDir).sort()).toEqual(["meta.json", "phase.json"]);
  });

  test("T5: a run whose client is still running exits 1 with 'still running' and keeps its report", async () => {
    const p = makeRun({ phase: "running", pid: process.pid, sessionId: "sess-1" });
    writeFileSync(p.report, "DONE\nkept\n");
    const r = await followupVerb("a1", "do X", env());
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("still running");
    expect(existsSync(p.report)).toBe(true);
  });

  test("T6: unknown run exits 1 with 'no such run'", async () => {
    const r = await followupVerb("zz", "do X", env());
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("no such run");
  });
});
