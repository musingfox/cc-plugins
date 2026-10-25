import { mkdirSync } from "node:fs";
import { LaunchError, openChannel, type Channel } from "./channel";
import { createPermissionHandler } from "./escalation";
import { handshake } from "./handshake";
import { runFollowupInbox } from "./inbox";
import { buildAgentLaunch } from "./launch";
import { gateEffort, gateModel } from "./model-gate";
import { enforceDefaultMode } from "./mode-gate";
import { buildPrompt } from "./prompt";
import { createProgressWriter } from "./progress";
import { createRunDir, readPhase, writeAtomic, writePhase, type Phase, type RunPaths } from "./layout";
import { copyDeps } from "./deps";
import { createTerminator, killGraceMs, type TerminatorState } from "./termination";
import { createWorkerWorktree, fetchBranchBack } from "./worktree";

export type DispatchRequest = {
  ticket: string;
  model: string;
  effort?: string;
  repoRoot: string;
  baseRef: string;
};

export type WorkerOptions = {
  env?: Record<string, string | undefined>;
  exit?: (code: number) => void;
  copyDeps?: typeof copyDeps;
};

type TurnResult = {
  stopReason?: string;
  _meta?: { quota?: { model_usage?: { model: string }[] } };
};

function setPhase(layout: RunPaths, phase: string, extra: Phase = {}): void {
  if (readPhase(layout)?.phase === "exited") return;
  writePhase(layout, { phase, pid: process.pid, updated: new Date().toISOString(), ...extra });
}

// head is the sha the coordinator should merge. A later fetch of the same report (idle timeout, stop) may
// move the branch, so it keeps the head recorded by the fetch that made the run collectable.
export function recordFetch(layout: RunPaths, result: ReturnType<typeof fetchBranchBack>): void {
  const kept = readPhase(layout)?.fetched === true ? readPhase(layout)?.head : undefined;
  const head = kept ?? (result.ok ? result.sha : undefined);
  writePhase(layout, { fetched: true, fetchError: result.ok ? undefined : result.error, head });
}

export async function runWorker(request: DispatchRequest, layout: RunPaths, opts: WorkerOptions = {}): Promise<void> {
  const env = opts.env ?? process.env;
  const exit = opts.exit ?? ((code: number) => process.exit(code));
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
  const prompt = buildPrompt({ worktree: wt.worktree, reportPath: layout.report, ticket: request.ticket });
  setPhase(layout, "starting");
  const observe = createProgressWriter(layout, request.ticket);
  try {
    const deps = (opts.copyDeps ?? copyDeps)({ repoRoot: request.repoRoot, baseSha: wt.baseSha, clone: wt.worktree });
    writePhase(layout, { deps });
  } catch (e) {
    writePhase(layout, { deps: [], depsError: e instanceof Error ? e.message : String(e) });
  }

  const fetchBack = () => {
    const result = fetchBranchBack({ repoRoot: request.repoRoot, clone: wt.worktree, branch: wt.branch });
    recordFetch(layout, result);
  };

  const state: TerminatorState = {};
  const term = createTerminator({ layout, state, env, exit, fetchBack });

  let channel: Channel;
  try {
    const launch = buildAgentLaunch(env, layout.cache);
    channel = await openChannel({
      argv: launch.argv,
      env: launch.env,
      cwd: wt.worktree,
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
    const hs = await handshake(channel, { worktree: wt.worktree, cache: layout.cache, fenced: request.fenced });
    sessionId = hs.sessionId;
    state.sessionId = sessionId;
    const afterModel = await gateModel(channel, { sessionId, configOptions: hs.configOptions, requestedModel: request.model });
    if (request.effort) {
      await gateEffort(channel, { sessionId, configOptions: afterModel, requestedEffort: request.effort });
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
      worktreeReal: wt.worktree,
      fenced: request.fenced,
      trackPending: term.trackPending,
      terminate: term.terminate,
      logDecision,
      env,
    }),
  );
  channel.onNotification("session/update", observe);

  const failTurn = async (e: unknown) => {
    const grace = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), killGraceMs(env)));
    const exitCode = await Promise.race([channel.exited, grace]);
    if (exitCode !== undefined) await term.terminate("agent-exited", `exit code ${exitCode}`);
    else await term.terminate("prompt-error", (e as Error).message);
  };
  const recordTurn = (result: TurnResult | null) => {
    fetchBack();
    setPhase(layout, "idle", {
      stopReason: result?.stopReason,
      models: (result?._meta?.quota?.model_usage ?? []).map((u) => u.model),
    });
  };

  setPhase(layout, "running");
  const turn = channel.request("session/prompt", { sessionId, prompt: [{ type: "text", text: prompt }] });
  state.turn = turn;
  let result: TurnResult | null;
  try {
    result = (await turn) as TurnResult | null;
  } catch (e) {
    await failTurn(e);
    return;
  }
  recordTurn(result);

  try {
    await runFollowupInbox({
      paths: layout,
      channel,
      sessionId,
      onTurn: (followup) => {
        state.turn = followup;
        followup.then((r) => recordTurn(r as TurnResult | null), () => {});
      },
    });
  } catch (e) {
    await failTurn(e);
    return;
  }
  fetchBack();
  term.dispose();
  await channel.close();
  exit(0);
}
