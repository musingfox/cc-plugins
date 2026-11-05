#!/usr/bin/env node
// Appends one rating line to ~/.claude/usage-data/ratings.jsonl.
// Re-rating a session appends another line; the last line for a session wins.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const sessionId = getArg("session");
const score = Number(getArg("score"));
const reason = getArg("reason") || "";
const suggestedArg = getArg("suggested");
const suggested = suggestedArg === undefined ? undefined : Number(suggestedArg);
const projectPath = getArg("project") || process.cwd();

const isScore = (n) => Number.isInteger(n) && n >= 1 && n <= 5;
if (!sessionId || !isScore(score) || (suggested !== undefined && !isScore(suggested))) {
  console.error("usage: rate.mjs --session <id> --score <1-5> [--suggested <1-5>] [--reason <text>] [--project <path>]");
  process.exit(1);
}

const file = path.join(os.homedir(), ".claude", "usage-data", "ratings.jsonl");
fs.mkdirSync(path.dirname(file), { recursive: true });
const record = {
  session_id: sessionId,
  project_path: projectPath,
  score,
  // The score Claude recommended: the model's own assessment, which /dream compares against.
  suggested,
  reason,
  rated_at: new Date().toISOString(),
};
fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
console.log(`rated ${sessionId} ${score}/5 → ${file}`);
