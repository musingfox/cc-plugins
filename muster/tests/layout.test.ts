import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  UsageError,
  createRunDir,
  readPhase,
  runPaths,
  writeAtomic,
  writePhase,
} from "../src/layout";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "muster-layout-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("RunLayout", () => {
  test("T1: paths resolve under MUSTER_HOME/runs/<name>", () => {
    const p = runPaths("a1", { MUSTER_HOME: "/tmp/m1", HOME: "/tmp/h" });
    expect(p.runDir).toBe("/tmp/m1/runs/a1");
    expect(p.worktree).toBe("/tmp/m1/runs/a1/worktree");
    expect(p.report).toBe("/tmp/m1/runs/a1/REPORT.md");
    expect(p.question(3)).toBe("/tmp/m1/runs/a1/QUESTION-3.json");
  });

  test("T2: without MUSTER_HOME, runs live under HOME/.cache/muster", () => {
    const p = runPaths("a1", { HOME: "/tmp/h" });
    expect(p.runDir).toBe("/tmp/h/.cache/muster/runs/a1");
  });

  test("T3: createRunDir makes runDir mode 0700", () => {
    const p = runPaths("a1", { MUSTER_HOME: home, HOME: home });
    createRunDir(p);
    expect(statSync(p.runDir).mode & 0o777).toBe(0o700);
  });

  test("T4: invalid names throw UsageError and create nothing", () => {
    for (const bad of ["../x", "A b", "", "-a", "a".repeat(41)]) {
      expect(() => createRunDir(runPaths(bad, { MUSTER_HOME: home, HOME: home }))).toThrow(UsageError);
    }
    expect(readdirSync(home)).toEqual([]);
  });

  test("T5: existing runDir throws UsageError containing 'exists' and is untouched", () => {
    const p = runPaths("a1", { MUSTER_HOME: home, HOME: home });
    createRunDir(p);
    writeFileSync(join(p.runDir, "marker"), "keep");
    let caught: unknown;
    try {
      createRunDir(p);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UsageError);
    expect((caught as Error).message).toContain("exists");
    expect(readFileSync(join(p.runDir, "marker"), "utf8")).toBe("keep");
  });

  test("T6: writeAtomic writes the content and leaves no temp sibling", () => {
    const target = join(home, "out.txt");
    writeAtomic(target, "x");
    expect(readFileSync(target, "utf8")).toBe("x");
    expect(readdirSync(home).filter((f) => f.includes("tmp"))).toEqual([]);
  });

  test("T7: writePhase merges atomically; garbage phase.json reads as undefined", () => {
    const p = runPaths("a1", { MUSTER_HOME: home, HOME: home });
    createRunDir(p);
    writePhase(p, { phase: "running" });
    writePhase(p, { stopReason: "end_turn" });
    expect(readPhase(p)).toEqual({ phase: "running", stopReason: "end_turn" });
    writeFileSync(p.phase, "{not json");
    expect(readPhase(p)).toBeUndefined();
  });
});
