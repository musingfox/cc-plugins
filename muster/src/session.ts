import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { LaunchError, openChannel, type Channel } from "./channel";
import { createPermissionHandler } from "./escalation";
import { handshake } from "./handshake";
import { buildAgentLaunch } from "./launch";
import { gateEffort, gateModel } from "./model-gate";
import { enforceDefaultMode } from "./mode-gate";
import { buildFollowup, buildPrompt } from "./prompt";
import { createProgressWriter, createReplyReader } from "./progress";
import { createRunDir, readPhase, writeAtomic, writePhase, type Phase, type RunPaths } from "./layout";
import { copyDeps } from "./deps";
import { writeTurnReport } from "./report";
import { createTerminator, killGraceMs, type TerminatorState } from "./termination";
import { DEFAULT_ALLOWED_HOSTS, resolveAllowedHosts, workerTempDirs } from "./sandbox";
import { createWorkerWorktree, fetchBranchBack } from "./worktree";

export type DispatchRequest = {
  ticket: string;
  model: string;
  effort?: string;
  issue?: string;
  repoRoot: string;
  baseRef: string;
  fenced: boolean;
};

export type WorkerOptions = {
  env?: Record<string, string | undefined>;
  exit?: (code: number) => void;
  copyDeps?: typeof copyDeps;
};

// The exit reason of a client whose turn ended normally.
export const TURN_ENDED = "turn-ended";

// What every turn's client starts the agent with; meta.json records it, so a follow-up starts the same client.
export type ClientSpec = {
  repoRoot: string;
  worktree: string;
  branch: string;
  model: string;
  effort?: string;
  fenced: boolean;
  allowedHosts: string[];
};

type TurnResult = {
  stopReason?: string;
  _meta?: { quota?: { model_usage?: { model: string }[] } };
};

function setPhase(layout: RunPaths, phase: string, extra: Phase = {}): void {
  if (readPhase(layout)?.phase === "exited") return;
  writePhase(layout, { phase, pid: process.pid, ...extra });
}

// head is the sha the coordinator should merge. A later fetch of the same report (stop) may move the branch,
// so it keeps the head recorded by the fetch that made the run collectable. extra lands in the same write.
export function recordFetch(layout: RunPaths, result: ReturnType<typeof fetchBranchBack>, extra: Phase = {}): void {
  const kept = readPhase(layout)?.fetched === true ? readPhase(layout)?.head : undefined;
  const head = kept ?? (result.ok ? result.sha : undefined);
  writePhase(layout, { fetched: true, fetchError: result.ok ? undefined : result.error, head, ...extra });
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

export function readClientSpec(layout: RunPaths): ClientSpec | undefined {
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(readFileSync(layout.meta, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const { repoRoot, worktree, branch, model, effort } = meta ?? {};
  if (typeof repoRoot !== "string" || typeof worktree !== "string" || typeof branch !== "string" || typeof model !== "string") {
    return undefined;
  }
  // A run recorded before meta.json carried fenced was fenced unless dispatched --unfenced; assume the fence.
  // One recorded before allowedHosts gets the defaults: its dispatch list is unknown, and the followup's env must not choose.
  return {
    repoRoot,
    worktree,
    branch,
    model,
    ...(typeof effort === "string" ? { effort } : {}),
    fenced: meta.fenced !== false,
    allowedHosts: Array.isArray(meta.allowedHosts) ? strings(meta.allowedHosts) : [...DEFAULT_ALLOWED_HOSTS],
  };
}

export async function runWorker(request: DispatchRequest, layout: RunPaths, opts: WorkerOptions = {}): Promise<void> {
  const allowedHosts = resolveAllowedHosts(opts.env ?? process.env);
  createRunDir(layout);
  mkdirSync(layout.cache);
  const wt = createWorkerWorktree({
    repoRoot: request.repoRoot,
    baseRef: request.baseRef,
    name: layout.name,
    worktreePath: layout.worktree,
  });
  writeAtomic(
    layout.meta,
    JSON.stringify(
      {
        name: layout.name,
        model: request.model,
        ...(request.effort ? { effort: request.effort } : {}),
        ...(request.issue ? { issue: request.issue } : {}),
        fenced: request.fenced,
        allowedHosts,
        repoRoot: request.repoRoot,
        worktree: wt.worktree,
        branch: wt.branch,
        baseSha: wt.baseSha,
        started: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
  const prompt = buildPrompt({ worktree: wt.worktree, ticket: request.ticket });
  setPhase(layout, "starting");
  const observe = createProgressWriter(layout, request.ticket);
  try {
    const deps = (opts.copyDeps ?? copyDeps)({ repoRoot: request.repoRoot, baseSha: wt.baseSha, clone: wt.worktree });
    writePhase(layout, { deps });
  } catch (e) {
    writePhase(layout, { deps: [], depsError: e instanceof Error ? e.message : String(e) });
  }
  const spec: ClientSpec = {
    repoRoot: request.repoRoot,
    worktree: wt.worktree,
    branch: wt.branch,
    model: request.model,
    ...(request.effort ? { effort: request.effort } : {}),
    fenced: request.fenced,
    allowedHosts,
  };
  await runTurn(layout, spec, { prompt, observe }, opts);
}

// Runs one follow-up turn in a new client that resumes the run's session. The caller has claimed the run:
// phase.json names this process and the session to resume.
export async function resumeWorker(layout: RunPaths, spec: ClientSpec, text: string, opts: WorkerOptions = {}): Promise<void> {
  const prior = readPhase(layout);
  const observe = createProgressWriter(layout, "", prior);
  await runTurn(layout, spec, { prompt: buildFollowup({ text }), observe, resume: prior?.sessionId as string }, opts);
}

async function runTurn(
  layout: RunPaths,
  spec: ClientSpec,
  turn: { prompt: string; observe: (params: unknown) => void; resume?: string },
  opts: WorkerOptions,
): Promise<void> {
  const env = opts.env ?? process.env;
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  const reply = createReplyReader();
  const fetchBack = (extra: Phase = {}) => {
    const result = fetchBranchBack({ repoRoot: spec.repoRoot, clone: spec.worktree, branch: spec.branch });
    recordFetch(layout, result, extra);
  };

  const state: TerminatorState = {};
  const term = createTerminator({ layout, state, env, exit, fetchBack: () => fetchBack() });

  let channel: Channel;
  try {
    // recursive: a run dispatched before the launch cache existed has none on its first followup.
    mkdirSync(layout.launchCache, { recursive: true });
    const launch = buildAgentLaunch(env, layout.launchCache);
    channel = await openChannel({
      argv: launch.argv,
      env: launch.env,
      cwd: spec.worktree,
      eventsPath: layout.events,
      stderrPath: layout.stderrLog,
    });
  } catch (e) {
    if (e instanceof LaunchError) {
      await term.terminate("agent-launch-failed", e.message);
      return;
    }
    throw e;
  }
  state.channel = channel;
  term.watch();

  let sessionId: string;
  try {
    const hs = await handshake(channel, {
      worktree: spec.worktree,
      cache: layout.cache,
      fenced: spec.fenced,
      resume: turn.resume,
      allowedHosts: spec.allowedHosts,
    });
    sessionId = hs.sessionId;
    state.sessionId = sessionId;
    writePhase(layout, { sessionId });
    const afterModel = await gateModel(channel, { sessionId, configOptions: hs.configOptions, requestedModel: spec.model });
    if (spec.effort) {
      await gateEffort(channel, { sessionId, configOptions: afterModel, requestedEffort: spec.effort });
    }
    await enforceDefaultMode(channel, { configOptions: hs.configOptions, sessionId });
  } catch (e) {
    await term.terminate("handshake-failed", (e as Error).message);
    return;
  }

  const logDecision = async (msg: object) => {
    await channel.logDecision(msg);
    if (readPhase(layout)?.phase === "question") setPhase(layout, "running");
  };
  channel.onRequest(
    "session/request_permission",
    createPermissionHandler({
      layout,
      worktreeReal: spec.worktree,
      pathContext: { home: env.HOME ?? homedir(), tempRoots: workerTempDirs(), runsDir: dirname(layout.runDir) },
      fenced: spec.fenced,
      allowedHosts: spec.allowedHosts,
      trackPending: term.trackPending,
      terminate: term.terminate,
      logDecision,
      env,
    }),
  );
  channel.onNotification("session/update", (params) => {
    turn.observe(params);
    reply.observe(params);
  });

  setPhase(layout, "running");
  const pending = channel.request("session/prompt", { sessionId, prompt: [{ type: "text", text: turn.prompt }] });
  state.turn = pending;
  let result: TurnResult | null;
  try {
    result = (await pending) as TurnResult | null;
  } catch (e) {
    const grace = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), killGraceMs(env)));
    const exitCode = await Promise.race([channel.exited, grace]);
    if (exitCode !== undefined) await term.terminate("agent-exited", `exit code ${exitCode}`);
    else await term.terminate("prompt-error", (e as Error).message);
    return;
  }
  // A stop or question timeout that cancelled the turn ends the run its own way; this waits for the
  // termination already under way, whose reason stands.
  if (state.terminating) {
    await term.terminate("stopped");
    return;
  }

  // The agent ends before the report and the fetch-back: the run reads as done only once the client is exiting.
  term.dispose();
  await channel.close();
  try {
    writeTurnReport(layout.report, reply.take());
  } catch (e) {
    process.stderr.write(`muster: report write failed: ${(e as Error).message}\n`);
  }
  const models = [...new Set([...strings(readPhase(layout)?.models), ...(result?._meta?.quota?.model_usage ?? []).map((u) => u.model)])];
  try {
    fetchBack({ phase: "exited", reason: TURN_ENDED, stopReason: result?.stopReason, models });
  } catch (e) {
    process.stderr.write(`muster: fetch-back failed: ${(e as Error).message}\n`);
    writePhase(layout, { phase: "exited", reason: TURN_ENDED, stopReason: result?.stopReason, models });
  }
  exit(0);
}
