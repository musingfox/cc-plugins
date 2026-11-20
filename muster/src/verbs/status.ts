import { existsSync } from "node:fs";
import { type Env, runPaths } from "../layout";
import { readStatus, renderStatus } from "../status";

export interface VerbResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function statusVerb(name: string, env: Env): VerbResult {
  const p = runPaths(name, env);
  if (!existsSync(p.meta)) {
    return { exitCode: 1, stdout: "", stderr: `no such run: ${name}\n` };
  }
  return { exitCode: 0, stdout: `${renderStatus(readStatus(p.runDir))}\n`, stderr: "" };
}

// The last stdout line of `run` and `followup`: what `status` would print once the turn has ended.
export function withStatusLine(name: string, env: Env, exit: (code: number) => void = (c) => process.exit(c)): (code: number) => void {
  return (code) => {
    const p = runPaths(name, env);
    if (existsSync(p.meta)) process.stdout.write(`${renderStatus(readStatus(p.runDir))}\n`);
    exit(code);
  };
}
