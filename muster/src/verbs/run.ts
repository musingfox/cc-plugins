import { resolve } from "node:path";
import { type Env, runPaths } from "../layout";
import { parseRunArgs } from "../run-args";
import { runWorker } from "../session";
import { withStatusLine } from "./status";

export async function runVerb(args: string[], env: Env): Promise<number> {
  // runWorker records the host list from the same variable; this refuses an invalid one before RUNDIR exists.
  const request = parseRunArgs(args, { ...env, MUSTER_ALLOW_HOSTS: process.env.MUSTER_ALLOW_HOSTS });
  const layout = runPaths(request.name, env);
  process.stdout.write(`RUNDIR=${resolve(layout.runDir)}\n`);
  await runWorker(request, layout, { exit: withStatusLine(request.name, env) });
  return 0;
}
