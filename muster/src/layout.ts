import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export type Env = { MUSTER_HOME?: string; HOME: string };
export type Phase = Record<string, unknown>;

export interface RunPaths {
  name: string;
  runDir: string;
  worktree: string;
  cache: string;
  meta: string;
  events: string;
  stderrLog: string;
  phase: string;
  report: string;
  stop: string;
  question(n: number): string;
  answer(n: number): string;
  followup(n: number): string;
}

export function runPaths(name: string, env: Env): RunPaths {
  if (!NAME_RE.test(name)) {
    throw new UsageError(`invalid run name "${name}": must match ${NAME_RE.source}`);
  }
  const base = env.MUSTER_HOME || join(env.HOME, ".cache", "muster");
  const runDir = join(base, "runs", name);
  return {
    name,
    runDir,
    worktree: join(runDir, "worktree"),
    cache: join(runDir, "cache"),
    meta: join(runDir, "meta.json"),
    events: join(runDir, "events.jsonl"),
    stderrLog: join(runDir, "stderr.log"),
    phase: join(runDir, "phase.json"),
    report: join(runDir, "REPORT.md"),
    stop: join(runDir, "STOP"),
    question: (n) => join(runDir, `QUESTION-${n}.json`),
    answer: (n) => join(runDir, `ANSWER-${n}.json`),
    followup: (n) => join(runDir, `FOLLOWUP-${n}.md`),
  };
}

export function createRunDir(p: RunPaths): void {
  if (existsSync(p.runDir)) {
    throw new UsageError(`run "${p.name}" already exists at ${p.runDir}`);
  }
  mkdirSync(p.runDir, { recursive: true, mode: 0o700 });
}

export function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

export function readPhase(p: RunPaths): Phase | undefined {
  try {
    return JSON.parse(readFileSync(p.phase, "utf8")) as Phase;
  } catch {
    return undefined;
  }
}

export function writePhase(p: RunPaths, patch: Phase): void {
  writeAtomic(p.phase, JSON.stringify({ ...(readPhase(p) ?? {}), ...patch }));
}
