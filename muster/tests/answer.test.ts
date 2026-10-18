import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunDir, runPaths, type RunPaths } from "../src/layout";
import { answerVerb } from "../src/verbs/answer";

let home: string;
const env = () => ({ MUSTER_HOME: home, HOME: home });

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "muster-answer-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function makeRun(): RunPaths {
  const p = runPaths("a1", env());
  createRunDir(p);
  return p;
}

describe("AnswerCommand", () => {
  test("T1: answers the single pending question with an ANSWER file", () => {
    const p = makeRun();
    writeFileSync(p.question(1), JSON.stringify({ paths: ["x"] }));
    const r = answerVerb(["a1", "allow"], env());
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(p.answer(1), "utf8"))).toEqual({ decision: "allow" });
    expect(r.stdout).toBe("answered a1 question=1 decision=allow\n");
  });

  test("T2: without --n answers the lowest pending question; --n N answers that one", () => {
    const p = makeRun();
    writeFileSync(p.question(1), "{}");
    writeFileSync(p.question(2), "{}");
    const first = answerVerb(["a1", "deny"], env());
    expect(first.exitCode).toBe(0);
    expect(existsSync(p.answer(1))).toBe(true);
    expect(existsSync(p.answer(2))).toBe(false);
    const second = answerVerb(["a1", "allow", "--n", "2"], env());
    expect(second.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(p.answer(2), "utf8"))).toEqual({ decision: "allow" });
    expect(second.stdout).toBe("answered a1 question=2 decision=allow\n");
  });

  test("T3: a decision other than allow/deny exits 2 and writes no file", () => {
    const p = makeRun();
    writeFileSync(p.question(1), "{}");
    const r = answerVerb(["a1", "maybe"], env());
    expect(r.exitCode).toBe(2);
    expect(existsSync(p.answer(1))).toBe(false);
  });

  test("T4: no pending question exits 1 and writes no file", () => {
    const p = makeRun();
    const r = answerVerb(["a1", "allow"], env());
    expect(r.exitCode).toBe(1);
    expect(readdirSync(p.runDir)).toEqual([]);
  });

  test("T5: an existing ANSWER-1 exits 1 and its content is unchanged", () => {
    const p = makeRun();
    writeFileSync(p.question(1), "{}");
    writeFileSync(p.answer(1), '{"decision":"deny"}');
    const r = answerVerb(["a1", "allow", "--n", "1"], env());
    expect(r.exitCode).toBe(1);
    expect(readFileSync(p.answer(1), "utf8")).toBe('{"decision":"deny"}');
  });
});
