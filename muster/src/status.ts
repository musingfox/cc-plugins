import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { readReport } from "./report";

export type RunState =
  | "starting"
  | "running"
  | "question"
  | "idle"
  | "done"
  | "blocked"
  | "malformed"
  | "dead";

export interface StatusLine {
  name: string;
  state: RunState;
  question?: number;
  paths?: string[];
  report?: string;
  stop?: string;
  fetchError?: string;
  head?: string;
  models?: string[];
  reason?: string;
}

type Json = Record<string, unknown>;

function readObject(file: string): Json | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Json)
      : undefined;
  } catch {
    return undefined;
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function pendingQuestion(runDir: string): { n: number; paths: string[] } | undefined {
  const unanswered = readdirSync(runDir)
    .map((file) => /^QUESTION-(\d+)\.json$/.exec(file))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .filter((n) => !existsSync(join(runDir, `ANSWER-${n}.json`)))
    .sort((a, b) => a - b);
  if (unanswered.length === 0) return undefined;
  const n = unanswered[0];
  const question = readObject(join(runDir, `QUESTION-${n}.json`));
  return { n, paths: strings(question?.paths) };
}

function classify(runDir: string, name: string): StatusLine {
  const reportPath = resolve(runDir, "REPORT.md");
  const report = readReport(reportPath);
  const phase = readObject(join(runDir, "phase.json"));

  // A stopped or blocked run no longer waits on its question, so the question must not mask the stop.
  if (report.kind !== "blocked" && phase?.phase !== "exited") {
    const question = pendingQuestion(runDir);
    if (question) {
      return { name, state: "question", question: question.n, paths: question.paths };
    }
  }

  // The report can land before the turn ends; the branch is in the user's repo only once the fetch-back is recorded.
  if (report.kind !== "none" && phase?.fetched === true) {
    const fetchError = typeof phase.fetchError === "string" ? phase.fetchError : undefined;
    const head = typeof phase.head === "string" ? phase.head : undefined;
    if (report.kind === "done") return { name, state: "done", report: reportPath, head, fetchError };
    if (report.kind === "blocked") {
      const reason = report.body.trim().replace(/\s*\n\s*/g, " ");
      return { name, state: "blocked", report: reportPath, reason, fetchError };
    }
    return { name, state: "malformed", fetchError };
  }

  if (!phase) return { name, state: "dead", reason: "phase-unreadable" };

  const phaseName = phase.phase;
  if (phaseName !== "exited" && typeof phase.pid === "number" && !pidAlive(phase.pid)) {
    return { name, state: "dead" };
  }
  // "question" is the window between a worker asking and resuming after ANSWER-n.json.
  if (phaseName === "question") return { name, state: "running" };
  if (phaseName === "starting" || phaseName === "running") return { name, state: phaseName };
  if (phaseName === "idle" || phaseName === "exited") {
    const stop = typeof phase.stopReason === "string" ? phase.stopReason : undefined;
    return { name, state: "idle", stop };
  }
  return { name, state: "dead", reason: "phase-unreadable" };
}

export function readStatus(runDir: string): StatusLine {
  const name = basename(runDir);
  const models = strings(readObject(join(runDir, "phase.json"))?.models);
  const line = classify(runDir, name);
  return models.length > 0 ? { ...line, models } : line;
}

export function renderStatus(s: StatusLine): string {
  const parts = [s.name, `state=${s.state}`];
  if (s.question !== undefined) parts.push(`question=${s.question}`);
  if (s.paths?.length) parts.push(`paths=${s.paths.join(",")}`);
  if (s.report) parts.push(`report=${s.report}`);
  if (s.head) parts.push(`head=${s.head}`);
  if (s.stop) parts.push(`stop=${s.stop}`);
  if (s.models?.length) parts.push(`models=${s.models.join(",")}`);
  if (s.reason) parts.push(`reason=${s.reason}`);
  if (s.fetchError) parts.push(`fetch-error=${s.fetchError.replace(/\s*\n\s*/g, " ")}`);
  return parts.join(" ");
}
