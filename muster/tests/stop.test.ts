import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunDir, runPaths, writeAtomic, writePhase } from "../src/layout";
import { stopVerb } from "../src/verbs/stop";

let home: string;
let env: { MUSTER_HOME: string; HOME: string };

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "muster-stop-"));
  env = { MUSTER_HOME: home, HOME: home };
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function makeRun(name: string, phase: string) {
  const p = runPaths(name, env);
  createRunDir(p);
  writeAtomic(p.meta, "{}");
  writePhase(p, { phase, pid: process.pid });
  return p;
}

describe("StopCommand", () => {
  test("T1: stopping a running run twice creates STOP and exits 0 both times", () => {
    const p = makeRun("a1", "running");
    const first = stopVerb("a1", env);
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toBe("stop requested a1\n");
    expect(existsSync(p.stop)).toBe(true);
    const second = stopVerb("a1", env);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toBe("stop requested a1\n");
  });

  test("T2: an exited run prints 'already exited' and creates no STOP", () => {
    const p = makeRun("a1", "exited");
    const r = stopVerb("a1", env);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.startsWith("already exited a1")).toBe(true);
    expect(existsSync(p.stop)).toBe(false);
  });

  test("T3: stopping a missing run exits 1", () => {
    const r = stopVerb("nope", env);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("no such run");
  });

  test("T4: stopping twice leaves one STOP file", () => {
    const p = makeRun("a1", "running");
    expect(stopVerb("a1", env).exitCode).toBe(0);
    expect(stopVerb("a1", env).exitCode).toBe(0);
    expect(existsSync(p.stop)).toBe(true);
  });
});
