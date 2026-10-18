import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunDir, runPaths, writePhase, type RunPaths } from "../src/layout";
import { readStatus, renderStatus } from "../src/status";
import { watchMain, watchVerb } from "../src/verbs/watch";

let home: string;
const env = () => ({ MUSTER_HOME: home, HOME: home });

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "muster-watch-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function makeRun(name = "w1"): RunPaths {
  const p = runPaths(name, env());
  createRunDir(p);
  writeFileSync(p.meta, JSON.stringify({ name }));
  return p;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function watchInBackground(name: string, intervalMs: number) {
  const lines: string[] = [];
  let settled: { exitCode: number; stderr: string } | undefined;
  const done = watchVerb(name, env(), { intervalMs, write: (l) => lines.push(l) }).then((r) => {
    settled = r;
    return r;
  });
  return { lines, done, settled: () => settled };
}

describe("WatchCommand", () => {
  test("T1: a running phase prints one state=running line and keeps watching", async () => {
    const p = makeRun();
    writePhase(p, { phase: "running", pid: process.pid });
    const w = watchInBackground("w1", 50);
    await sleep(300);
    expect(w.settled()).toBeUndefined();
    expect(w.lines).toEqual(["w1 state=running"]);
    writeFileSync(p.report, "DONE\nok");
    await w.done;
  });

  test("T2: a new QUESTION-1 prints state=question question=1 and exits 0 within 1 s", async () => {
    const p = makeRun();
    writePhase(p, { phase: "running", pid: process.pid });
    const w = watchInBackground("w1", 50);
    await sleep(100);
    writeFileSync(p.question(1), JSON.stringify({ paths: ["src/a.ts"] }));
    const started = Date.now();
    const result = await w.done;
    expect(Date.now() - started).toBeLessThan(1000);
    expect(result.exitCode).toBe(0);
    expect(w.lines.at(-1)).toBe("w1 state=question question=1 paths=src/a.ts");
  });

  test("T3: a run already done prints one line and exits immediately", async () => {
    const p = makeRun();
    writePhase(p, { phase: "idle", pid: process.pid, stopReason: "end_turn" });
    writeFileSync(p.report, "DONE\nok");
    const result = await watchVerb("w1", env(), { intervalMs: 2000, write: () => {} });
    const lines: string[] = [];
    const again = await watchVerb("w1", env(), { intervalMs: 2000, write: (l) => lines.push(l) });
    expect(result.exitCode).toBe(0);
    expect(again.exitCode).toBe(0);
    expect(lines).toEqual([`w1 state=done report=${p.report}`]);
  });

  test("T4: every printed line equals renderStatus(readStatus(dir)) for the same moment", async () => {
    const p = makeRun();
    writePhase(p, { phase: "running", pid: process.pid });
    const w = watchInBackground("w1", 50);
    await sleep(120);
    writeFileSync(p.question(1), JSON.stringify({ paths: [] }));
    await w.done;
    expect(w.lines[0]).toBe("w1 state=running");
    expect(w.lines.at(-1)).toBe(renderStatus(readStatus(p.runDir)));
    expect(w.lines.at(-1)).toBe("w1 state=question question=1");
  });

  test("T5: idle without a report exits", async () => {
    const p = makeRun();
    writePhase(p, { phase: "idle", pid: process.pid, stopReason: "end_turn" });
    const result = await watchVerb("w1", env(), { intervalMs: 50, write: () => {} });
    expect(result.exitCode).toBe(0);
    expect(readStatus(p.runDir).state).toBe("idle");
  });

  test("T6: watching an unknown run exits 1 with 'no such run: nope'", async () => {
    const result = await watchVerb("nope", env(), { intervalMs: 50, write: () => {} });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("no such run: nope\n");
  });
});

describe("WatchCommand argv", () => {
  test("R1: watchMain honours --interval-ms so a question written at 300 ms exits within 1 s", async () => {
    const p = makeRun();
    writePhase(p, { phase: "running", pid: process.pid });
    const lines: string[] = [];
    const started = Date.now();
    const done = watchMain(["w1", "--interval-ms", "50"], env(), (l) => lines.push(l));
    await sleep(300);
    writeFileSync(p.question(1), JSON.stringify({ n: 1, paths: [] }));
    const result = await done;
    expect(Date.now() - started).toBeLessThan(1000);
    expect(result.exitCode).toBe(0);
    expect(lines.at(-1)).toBe("w1 state=question question=1");
  });
});
