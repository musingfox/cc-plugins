import { closeSync, existsSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Env, type RunPaths, readPhase, runPaths, writeAtomic, writePhase } from "../layout";
import { readClientSpec, resumeWorker, type WorkerOptions } from "../session";
import { pidAlive } from "../status";
import { type VerbResult, withStatusLine } from "./status";

const refuse = (exitCode: number, stderr: string): VerbResult => ({ exitCode, stdout: "", stderr: `${stderr}\n` });

// A question the previous turn left open was cancelled with that turn; answering it records that nothing waits on it.
function closeOpenQuestions(p: RunPaths): void {
  for (const name of readdirSync(p.runDir)) {
    const m = /^QUESTION-(\d+)\.json$/.exec(name);
    if (m && !existsSync(p.answer(Number(m[1])))) {
      writeAtomic(p.answer(Number(m[1])), JSON.stringify({ decision: "deny", by: "turn-ended" }) + "\n");
    }
  }
}

function holderAlive(lock: string): boolean {
  const pid = Number(readFileSync(lock, "utf8"));
  return !Number.isInteger(pid) || pid <= 0 || pidAlive(pid);
}

// Checks that no client runs and claims the run for this process. The exclusive CLAIM file makes check-and-claim
// atomic: of two followups only one sees the client gone and writes its own pid. A CLAIM whose holder died
// between creating and removing it is taken over.
function claimClient(p: RunPaths): string | undefined {
  const lock = join(p.runDir, "CLAIM");
  let fd: number | undefined;
  for (let attempt = 0; fd === undefined; attempt++) {
    try {
      fd = openSync(lock, "wx");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      if (attempt > 0 || holderAlive(lock)) return `run ${p.name}: a client is still running; wait for its turn to end`;
      rmSync(lock, { force: true });
    }
  }
  try {
    writeFileSync(fd, String(process.pid));
    const phase = readPhase(p);
    if (phase?.phase !== "exited" && typeof phase?.pid === "number" && pidAlive(phase.pid)) {
      return `run ${p.name}: a client is still running; wait for its turn to end`;
    }
    if (typeof phase?.sessionId !== "string") return `run ${p.name}: no session to resume`;
    // The previous turn's report must not stand for this one, and its STOP must not end this turn.
    rmSync(p.report, { force: true });
    rmSync(p.stop, { force: true });
    closeOpenQuestions(p);
    writePhase(p, {
      phase: "starting",
      pid: process.pid,
      fetched: false,
      reason: undefined,
      detail: undefined,
      stopReason: undefined,
    });
    return undefined;
  } finally {
    closeSync(fd);
    rmSync(lock, { force: true });
  }
}

export async function followupVerb(
  name: string,
  body: string | { file: string },
  env: Env,
  opts: WorkerOptions = {},
): Promise<VerbResult> {
  const p = runPaths(name, env);
  if (!existsSync(p.meta)) return refuse(1, `no such run: ${name}`);

  const text = typeof body === "string" ? body : readFileSync(body.file, "utf8");
  if (text.trim() === "") return refuse(2, "follow-up text is empty");

  const spec = readClientSpec(p);
  if (!spec) return refuse(1, `run ${name} has an unreadable meta.json; cannot start its client`);

  const refused = claimClient(p);
  if (refused) return refuse(1, refused);
  await resumeWorker(p, spec, text, { ...opts, exit: withStatusLine(name, env, opts.exit) });
  return { exitCode: 0, stdout: "", stderr: "" };
}
