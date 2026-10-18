import { UsageError } from "./layout";
import type { Reason } from "./termination";

const DEFAULT_QUESTION_TIMEOUT_MS = 1800000;

export function questionTimeoutMs(env: { MUSTER_QUESTION_TIMEOUT_MS?: string } = process.env): number {
  const raw = env.MUSTER_QUESTION_TIMEOUT_MS;
  if (raw === undefined) return DEFAULT_QUESTION_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new UsageError(`MUSTER_QUESTION_TIMEOUT_MS must be a positive number, got "${raw}"`);
  }
  return n;
}

export function awaitAnswerWithin<T>(
  wait: Promise<T>,
  n: number,
  terminate: (reason: Reason, detail?: string) => Promise<number>,
  ms: number = questionTimeoutMs(),
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      void terminate("question-timeout", `question ${n} unanswered for ${ms} ms`);
    }, ms);
    wait.then(
      (answer) => {
        clearTimeout(timer);
        resolve(answer);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
