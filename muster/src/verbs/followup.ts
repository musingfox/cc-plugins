import { existsSync, linkSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Env, readPhase, runPaths } from "../layout";
import { readStatus } from "../status";
import type { VerbResult } from "./status";

const FOLLOWUP_RE = /^FOLLOWUP-(\d+)(\.sent)?\.md$/;

function highestFollowUp(runDir: string): number {
  return readdirSync(runDir).reduce((max, file) => {
    const m = FOLLOWUP_RE.exec(file);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
}

export function followupVerb(name: string, body: string | { file: string }, env: Env): VerbResult {
  const p = runPaths(name, env);
  if (!existsSync(p.meta)) {
    return { exitCode: 1, stdout: "", stderr: `no such run: ${name}\n` };
  }

  const text = typeof body === "string" ? body : readFileSync(body.file, "utf8");
  if (text.trim() === "") {
    return { exitCode: 2, stdout: "", stderr: "follow-up text is empty\n" };
  }

  if (readPhase(p)?.phase === "exited" || readStatus(p.runDir).state === "dead") {
    return { exitCode: 1, stdout: "", stderr: "client exited; cannot follow up\n" };
  }

  // Exclusive hard-link publish: a reader never sees a partial file, and a
  // concurrent writer that picked the same n gets EEXIST and retries with n+1.
  for (;;) {
    const n = highestFollowUp(p.runDir) + 1;
    const target = join(p.runDir, `FOLLOWUP-${n}.md`);
    const tmp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    writeFileSync(tmp, text);
    try {
      linkSync(tmp, target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw err;
    } finally {
      unlinkSync(tmp);
    }
    return { exitCode: 0, stdout: `queued ${name} followup=${n}\n`, stderr: "" };
  }
}
