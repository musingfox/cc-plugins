#!/usr/bin/env bun
import { type Env, UsageError } from "./layout";
import { answerVerb } from "./verbs/answer";
import { followupVerb } from "./verbs/followup";
import { runVerb } from "./verbs/run";
import { statusVerb, type VerbResult } from "./verbs/status";
import { stopVerb } from "./verbs/stop";
import { watchVerb } from "./verbs/watch";

const VERBS = ["run", "status", "watch", "answer", "followup", "stop"];
const USAGE = `usage: muster <${VERBS.join("|")}> [args]`;

function usage(): number {
  process.stderr.write(`${USAGE}\n`);
  return 2;
}

function emit(r: VerbResult): number {
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  return r.exitCode;
}

async function main(argv: string[]): Promise<number> {
  const [verb, ...args] = argv;
  if (verb === "--help") {
    process.stdout.write(`${VERBS.join("\n")}\n`);
    return 0;
  }
  if (verb === undefined || !VERBS.includes(verb)) return usage();

  const env: Env = { MUSTER_HOME: process.env.MUSTER_HOME, HOME: process.env.HOME ?? "" };
  const [name] = args;
  if (verb !== "run" && verb !== "answer" && name === undefined) return usage();

  switch (verb) {
    case "run":
      return runVerb(args, env);
    case "status":
      return emit(statusVerb(name, env));
    case "watch":
      return emit(
        await watchVerb(name, env, { write: (line) => process.stdout.write(`${line}\n`) }),
      );
    case "answer":
      return emit(answerVerb(args, env));
    case "followup": {
      if (args[1] === "--file" && args[2] !== undefined) {
        return emit(followupVerb(name, { file: args[2] }, env));
      }
      if (args[1] === undefined) return usage();
      return emit(followupVerb(name, args[1], env));
    }
    case "stop":
      return emit(stopVerb(name, env));
  }
  return usage();
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    if (err instanceof UsageError) {
      process.stderr.write(`muster: ${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    throw err;
  },
);
