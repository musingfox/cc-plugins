import { appendFileSync, existsSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { Channel } from "./channel";
import { type RunPaths, readPhase, writePhase } from "./layout";
import { buildFollowup } from "./prompt";

const DEFAULT_IDLE_TIMEOUT_MS = 900000;
const DEFAULT_POLL_MS = 250;
const FOLLOWUP_RE = /^FOLLOWUP-(\d+)\.md$/;

export function idleTimeoutMs(): number {
  const raw = process.env.MUSTER_IDLE_TIMEOUT_MS;
  return raw === undefined ? DEFAULT_IDLE_TIMEOUT_MS : Number(raw);
}

export function pollMs(): number {
  const raw = process.env.MUSTER_POLL_MS;
  return raw === undefined ? DEFAULT_POLL_MS : Number(raw);
}

function nextFollowup(runDir: string): string | undefined {
  const numbered = readdirSync(runDir)
    .map((name) => ({ name, m: FOLLOWUP_RE.exec(name) }))
    .filter((x): x is { name: string; m: RegExpExecArray } => x.m !== null)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]));
  return numbered[0]?.name;
}

function archiveReport(p: RunPaths): void {
  if (!existsSync(p.report)) return;
  let k = 1;
  while (existsSync(join(p.runDir, `REPORT.prev-${k}.md`))) k++;
  renameSync(p.report, join(p.runDir, `REPORT.prev-${k}.md`));
}

function logClientDecision(p: RunPaths, msg: object): void {
  appendFileSync(p.events, JSON.stringify({ t: new Date().toISOString(), dir: "client-decision", msg }) + "\n");
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runFollowupInbox(opts: {
  paths: RunPaths;
  channel: Channel;
  sessionId: string;
  onTurn?: (turn: Promise<unknown>) => void;
}): Promise<void> {
  const { paths: p, channel, sessionId, onTurn } = opts;
  writePhase(p, { phase: "idle" });
  let idleSince = Date.now();
  for (;;) {
    if (readPhase(p)?.phase !== "idle") {
      idleSince = Date.now();
      await sleep(pollMs());
      continue;
    }
    const name = nextFollowup(p.runDir);
    if (name === undefined) {
      if (Date.now() - idleSince >= idleTimeoutMs()) {
        writePhase(p, { phase: "exited", reason: "idle-timeout" });
        return;
      }
      await sleep(pollMs());
      continue;
    }
    const src = join(p.runDir, name);
    const text = readFileSync(src, "utf8");
    renameSync(src, join(p.runDir, name.replace(/\.md$/, ".sent.md")));
    idleSince = Date.now();
    if (text.trim() === "") {
      logClientDecision(p, { level: "warn", file: name, reason: "empty follow-up skipped" });
      continue;
    }
    archiveReport(p);
    writePhase(p, { phase: "running" });
    const turn = channel.request("session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: buildFollowup({ text, reportPath: p.report }) }],
    });
    onTurn?.(turn);
    await turn;
    writePhase(p, { phase: "idle" });
    idleSince = Date.now();
  }
}
