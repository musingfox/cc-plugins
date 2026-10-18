import { existsSync } from "node:fs";
import { type Env, runPaths } from "../layout";
import { readStatus, renderStatus, type RunState } from "../status";
import type { VerbResult } from "./status";

const TERMINAL: ReadonlySet<RunState> = new Set<RunState>([
  "question",
  "idle",
  "done",
  "blocked",
  "malformed",
  "dead",
]);

export interface WatchOptions {
  intervalMs?: number;
  write: (line: string) => void;
}

export async function watchVerb(name: string, env: Env, opts: WatchOptions): Promise<VerbResult> {
  const p = runPaths(name, env);
  if (!existsSync(p.meta)) {
    return { exitCode: 1, stdout: "", stderr: `no such run: ${name}\n` };
  }
  const intervalMs = opts.intervalMs ?? 2000;
  let last: string | undefined;
  for (;;) {
    const status = readStatus(p.runDir);
    const line = renderStatus(status);
    if (line !== last) {
      opts.write(line);
      last = line;
    }
    if (TERMINAL.has(status.state)) return { exitCode: 0, stdout: "", stderr: "" };
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export function watchMain(argv: string[], env: Env, write: (line: string) => void): Promise<VerbResult> {
  const [name = "", ...rest] = argv;
  const flag = rest.indexOf("--interval-ms");
  const intervalMs = flag === -1 ? undefined : Number(rest[flag + 1]);
  return watchVerb(name, env, { intervalMs, write });
}
