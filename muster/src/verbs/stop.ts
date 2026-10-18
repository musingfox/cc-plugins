import { existsSync } from "node:fs";
import { type Env, readPhase, runPaths, writeAtomic } from "../layout";
import { readStatus } from "../status";
import type { VerbResult } from "./status";

export function stopVerb(name: string, env: Env): VerbResult {
  const p = runPaths(name, env);
  if (!existsSync(p.meta)) {
    return { exitCode: 1, stdout: "", stderr: `no such run: ${name}\n` };
  }
  if (readPhase(p)?.phase === "exited") {
    const { state } = readStatus(p.runDir);
    return { exitCode: 0, stdout: `already exited ${name} state=${state}\n`, stderr: "" };
  }
  writeAtomic(p.stop, "");
  return { exitCode: 0, stdout: `stop requested ${name}\n`, stderr: "" };
}
