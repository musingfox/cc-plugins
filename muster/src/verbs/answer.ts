import { existsSync, linkSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Env, UsageError, runPaths } from "../layout";
import type { VerbResult } from "./status";

const DECISIONS = ["allow", "deny"];

function pendingNumbers(runDir: string): number[] {
  return readdirSync(runDir)
    .map((file) => /^QUESTION-(\d+)\.json$/.exec(file))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .filter((n) => !existsSync(join(runDir, `ANSWER-${n}.json`)))
    .sort((a, b) => a - b);
}

function fail(exitCode: number, message: string): VerbResult {
  return { exitCode, stdout: "", stderr: `${message}\n` };
}

export function answerVerb(args: string[], env: Env): VerbResult {
  const [name, decision, ...rest] = args;
  let n: number | undefined;
  if (rest.length === 2 && rest[0] === "--n" && /^\d+$/.test(rest[1])) {
    n = Number(rest[1]);
  } else if (rest.length !== 0) {
    return fail(2, "usage: answer NAME allow|deny [--n N]");
  }
  if (name === undefined || decision === undefined || !DECISIONS.includes(decision)) {
    return fail(2, "usage: answer NAME allow|deny [--n N]");
  }

  let p: ReturnType<typeof runPaths>;
  try {
    p = runPaths(name, env);
  } catch (err) {
    if (err instanceof UsageError) return fail(2, err.message);
    throw err;
  }
  if (!existsSync(p.runDir)) return fail(1, `no such run: ${name}`);

  const pending = pendingNumbers(p.runDir);
  const question = n ?? pending[0];
  if (question === undefined || !pending.includes(question)) {
    return fail(1, `no pending question${n === undefined ? "" : ` ${n}`} for ${name}`);
  }

  const target = p.answer(question);
  const tmp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, JSON.stringify({ decision }));
  try {
    linkSync(tmp, target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      return fail(1, `question ${question} already answered for ${name}`);
    }
    throw err;
  } finally {
    unlinkSync(tmp);
  }
  return {
    exitCode: 0,
    stdout: `answered ${name} question=${question} decision=${decision}\n`,
    stderr: "",
  };
}
