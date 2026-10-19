import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunDir, runPaths, writePhase, type RunPaths } from "../src/layout";
import { readStatus, renderStatus } from "../src/status";
import { statusVerb } from "../src/verbs/status";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "muster-status-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function makeRun(name = "a1"): RunPaths {
  const p = runPaths(name, { MUSTER_HOME: home, HOME: home });
  createRunDir(p);
  writeFileSync(p.meta, JSON.stringify({ name }));
  return p;
}

function line(p: RunPaths): string {
  return renderStatus(readStatus(p.runDir));
}

describe("StatusReader", () => {
  test("T1: running phase with a live pid renders state=running", () => {
    const p = makeRun();
    writePhase(p, { phase: "running", pid: process.pid });
    expect(line(p)).toBe("a1 state=running");
  });

  test("T2: an unanswered question shows state=question until ANSWER-1 exists", () => {
    const p = makeRun();
    writePhase(p, { phase: "running", pid: process.pid });
    writeFileSync(p.question(1), JSON.stringify({ paths: ["src/a.ts", "src/b.ts"] }));
    expect(line(p)).toBe("a1 state=question question=1 paths=src/a.ts,src/b.ts");
    writeFileSync(p.answer(1), JSON.stringify({ text: "yes" }));
    expect(line(p)).toBe("a1 state=running");
  });

  test("T3: idle phase without report renders state=idle stop=end_turn, not done", () => {
    const p = makeRun();
    writePhase(p, { phase: "idle", pid: process.pid, stopReason: "end_turn" });
    expect(line(p)).toBe("a1 state=idle stop=end_turn");
  });

  test("T4: a DONE report renders state=done with the absolute report path, whatever the stopReason", () => {
    for (const stopReason of ["end_turn", "refusal", "cancelled"]) {
      const p = makeRun();
      writePhase(p, { fetched: true, phase: "idle", pid: process.pid, stopReason });
      writeFileSync(p.report, "DONE\nok");
      expect(line(p)).toBe(`a1 state=done report=${p.report}`);
      rmSync(p.runDir, { recursive: true, force: true });
    }
  });

  test("F1: a report whose fetch-back is not recorded yet reads running, then done once recorded", () => {
    const p = makeRun();
    writePhase(p, { phase: "running", pid: process.pid });
    writeFileSync(p.report, "DONE\nok");
    expect(line(p)).toBe("a1 state=running");
    writePhase(p, { fetched: true });
    expect(line(p)).toBe(`a1 state=done report=${p.report}`);
  });

  test("W3a: a done run prints the sha recorded at the fetch as head=", () => {
    const p = makeRun();
    writePhase(p, { phase: "idle", pid: process.pid, fetched: true, head: "abc123" });
    writeFileSync(p.report, "DONE\nok");
    expect(line(p)).toBe(`a1 state=done report=${p.report} head=abc123`);
  });

  test("F2: a recorded fetch failure still reads done and shows the failure", () => {
    const p = makeRun();
    writePhase(p, { phase: "idle", pid: process.pid, fetched: true, fetchError: "refused" });
    writeFileSync(p.report, "DONE\nok");
    expect(line(p)).toBe(`a1 state=done report=${p.report} fetch-error=refused`);
  });

  test("T5: BLOCKED report renders reason; a report with another first line is malformed", () => {
    const p = makeRun();
    writePhase(p, { fetched: true, phase: "idle", pid: process.pid, stopReason: "end_turn" });
    writeFileSync(p.report, "BLOCKED\nneed key");
    expect(readStatus(p.runDir)).toMatchObject({ state: "blocked", reason: "need key" });
    expect(line(p)).toContain("state=blocked");
    expect(line(p)).toContain("reason=need key");

    writeFileSync(p.report, "done");
    expect(readStatus(p.runDir).state).toBe("malformed");
  });

  test("T6: a pending question takes precedence over a valid DONE report", () => {
    const p = makeRun();
    writePhase(p, { phase: "idle", pid: process.pid, stopReason: "end_turn" });
    writeFileSync(p.report, "DONE\nok");
    writeFileSync(p.question(1), JSON.stringify({ paths: [] }));
    expect(readStatus(p.runDir).state).toBe("question");
  });

  test("R1: a stopped run shows blocked reason=stopped even while an unanswered question file remains", () => {
    const p = makeRun();
    writePhase(p, { fetched: true, phase: "exited", pid: 999999, stopReason: "stopped" });
    writeFileSync(p.question(1), JSON.stringify({ paths: ["/x"] }));
    writeFileSync(p.report, "BLOCKED\nstopped");
    expect(line(p)).toBe(`a1 state=blocked report=${p.report} reason=stopped`);
  });

  test("R2: phase question with every question answered renders state=running, not dead", () => {
    const p = makeRun();
    writePhase(p, { phase: "question", pid: process.pid });
    writeFileSync(p.question(1), JSON.stringify({ paths: [] }));
    writeFileSync(p.answer(1), JSON.stringify({ decision: "allow" }));
    expect(line(p)).toBe("a1 state=running");
  });

  test("T7: running phase whose pid has exited renders state=dead", async () => {
    const p = makeRun();
    const child = Bun.spawn(["true"]);
    await child.exited;
    writePhase(p, { phase: "running", pid: child.pid });
    expect(line(p)).toBe("a1 state=dead");
  });

  test("T8: exited phase with BLOCKED report reports models from the phase", () => {
    const p = makeRun();
    writePhase(p, { fetched: true, phase: "exited", pid: 999999, models: ["claude-haiku-5-5"] });
    writeFileSync(p.report, "BLOCKED\nneed key");
    expect(readStatus(p.runDir).state).toBe("blocked");
    expect(line(p)).toContain("models=claude-haiku-5-5");
  });

  test("T8b: an unreadable phase.json renders state=dead reason=phase-unreadable", () => {
    const p = makeRun();
    writeFileSync(p.phase, "{not json");
    expect(line(p)).toBe("a1 state=dead reason=phase-unreadable");
  });

  test("T9: status verb on an unknown run exits 1 with 'no such run: nope' on stderr", () => {
    const result = statusVerb("nope", { MUSTER_HOME: home, HOME: home });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("no such run: nope");
  });

  test("T9b: status verb on a known run prints the status line and exits 0", () => {
    const p = makeRun();
    writePhase(p, { phase: "running", pid: process.pid });
    const result = statusVerb("a1", { MUSTER_HOME: home, HOME: home });
    expect(result).toEqual({ exitCode: 0, stdout: "a1 state=running\n", stderr: "" });
  });
});
