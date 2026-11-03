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
const projectPath = getArg("project") || process.cwd();

if (!sessionId || !Number.isInteger(score) || score < 1 || score > 5) {
  console.error("usage: rate.mjs --session <id> --score <1-5> [--reason <text>] [--project <path>]");
  process.exit(1);
}

const file = path.join(os.homedir(), ".claude", "usage-data", "ratings.jsonl");
fs.mkdirSync(path.dirname(file), { recursive: true });
const record = {
  session_id: sessionId,
  project_path: projectPath,
  score,
  reason,
  rated_at: new Date().toISOString(),
};
fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
console.log(`rated ${sessionId} ${score}/5 → ${file}`);
