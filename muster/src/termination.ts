import { existsSync } from "node:fs";
import type { Channel } from "./channel";
import { UsageError, writeAtomic, writePhase, type RunPaths } from "./layout";
import { readReport } from "./report";

export type Reason =
  | "question-timeout"
  | "stopped"
  | "agent-exited"
  | "agent-launch-failed"
  | "handshake-failed"
  | "prompt-error";

export type TerminatorState = { channel?: Channel; sessionId?: string; turn?: Promise<unknown> };

type Env = { MUSTER_KILL_GRACE_MS?: string; MUSTER_POLL_MS?: string };

export type TerminatorOptions = {
  layout: RunPaths;
  state: TerminatorState;
  env?: Env;
  exit?: (code: number) => void;
  fetchBack?: () => void;
};

function positiveMs(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new UsageError(`${name} must be a positive number, got "${raw}"`);
  }
  return n;
}

export function killGraceMs(env: Env = process.env): number {
  return positiveMs("MUSTER_KILL_GRACE_MS", env.MUSTER_KILL_GRACE_MS, 5000);
}

export function pollMs(env: Env = process.env): number {
  return positiveMs("MUSTER_POLL_MS", env.MUSTER_POLL_MS, 500);
}

const noop = () => {};

async function within(p: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([p.then(() => true, () => true), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createTerminator(opts: TerminatorOptions) {
  const { layout, state } = opts;
  const env = opts.env ?? process.env;
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  const grace = killGraceMs(env);
  const poll = pollMs(env);
  const log = (msg: string) => process.stderr.write(`muster: ${msg}\n`);
  const cancels = new Set<{ cancel: () => void }>();
  let termination: Promise<number> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  const signal = (pid: number, sig: NodeJS.Signals) => {
    try {
      process.kill(pid, sig);
    } catch {
      // already gone
    }
  };

  async function run(reason: Reason, detail?: string): Promise<number> {
    clearInterval(timer);
    for (const entry of [...cancels]) {
      try {
        entry.cancel();
      } catch (e) {
        log(`pending cancel failed: ${(e as Error).message}`);
      }
    }

    const { channel, sessionId, turn } = state;
    let exited = false;
    channel?.exited.then(() => {
      exited = true;
    });
    if (channel && sessionId !== undefined) {
      await channel.notify("session/cancel", { sessionId }).catch((e: Error) => log(`session/cancel: ${e.message}`));
    }
    if (turn) await within(turn.then(noop, noop), grace);
    if (channel && !exited) {
      signal(channel.pid, "SIGTERM");
      if (!(await within(channel.exited, grace))) {
        signal(channel.pid, "SIGKILL");
        await within(channel.exited, grace);
      }
    }

    try {
      const report = readReport(layout.report);
      if (report.kind === "none" || report.kind === "malformed") {
        const text = detail ? `${reason}: ${detail}` : reason;
        writeAtomic(layout.report, `BLOCKED\nreason: ${text}\n`);
      }
    } catch (e) {
      log(`report write failed: ${(e as Error).message}`);
    }
    try {
      opts.fetchBack?.();
    } catch (e) {
      log(`fetch-back failed: ${(e as Error).message}`);
    }
    try {
      writePhase(layout, { phase: "exited", reason, ...(detail ? { detail } : {}) });
    } catch (e) {
      log(`phase write failed: ${(e as Error).message}`);
    }

    const code = reason === "stopped" ? 0 : 1;
    exit(code);
    return code;
  }

  const terminate = (reason: Reason, detail?: string): Promise<number> => {
    termination ??= run(reason, detail);
    return termination;
  };

  const watch = () => {
    timer = setInterval(() => {
      if (existsSync(layout.stop)) void terminate("stopped");
    }, poll);
    state.channel?.exited.then((code) => {
      if (!disposed) void terminate("agent-exited", `exit code ${code}`);
    });
  };

  const trackPending = (cancel: () => void): (() => void) => {
    const entry = { cancel };
    cancels.add(entry);
    return () => {
      cancels.delete(entry);
    };
  };

  const dispose = () => {
    disposed = true;
    clearInterval(timer);
  };

  return { terminate, watch, trackPending, dispose };
}
