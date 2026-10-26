import { existsSync, readFileSync, rmSync } from "node:fs";
import { type Env, readPhase, runPaths } from "../layout";
import { pidAlive } from "../status";
import { git } from "../worktree";
import type { VerbResult } from "./status";

function refuse(stderr: string): VerbResult {
  return { exitCode: 1, stdout: "", stderr: `${stderr}\n` };
}

function readMeta(metaPath: string): { baseSha: string; repoRoot: string } | undefined {
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { baseSha?: unknown; repoRoot?: unknown } | null;
    if (typeof meta?.repoRoot !== "string") return undefined;
    return { baseSha: typeof meta.baseSha === "string" ? meta.baseSha : "unknown", repoRoot: meta.repoRoot };
  } catch {
    return undefined;
  }
}

export function cleanVerb(name: string, env: Env): VerbResult {
  const p = runPaths(name, env);
  if (!existsSync(p.runDir)) return refuse(`no such run: ${name}`);
  const phase = readPhase(p);
  const exited = phase?.phase === "exited";
  const dead = phase !== undefined && typeof phase.pid === "number" && !pidAlive(phase.pid);
  if (!exited && !dead) {
    return refuse(`run ${name} is still running; stop it and wait for it to exit before clean`);
  }
  const meta = readMeta(p.meta);
  if (!meta) return refuse(`run ${name} has an unreadable meta.json, so the repository is unknown; nothing removed`);

  const branch = `refs/heads/muster/${name}`;
  const clone = existsSync(p.worktree)
    ? git(p.worktree, ["rev-parse", "--verify", "--quiet", `${branch}^{commit}`])
    : undefined;
  const head = clone?.ok ? clone.stdout : undefined;
  if (head !== undefined) {
    const inRepo = git(meta.repoRoot, ["merge-base", "--is-ancestor", head, branch]);
    if (!inRepo.ok) {
      return refuse(
        `run ${name}: the repository lacks the clone's commit ${head} on muster/${name}; fetch the branch by hand with the command in the skill's Collect section, then run clean again`,
      );
    }
  }
  rmSync(p.runDir, { recursive: true, force: true });
  return { exitCode: 0, stdout: `removed ${p.runDir} base=${meta.baseSha} head=${head ?? "unknown"}\n`, stderr: "" };
}
