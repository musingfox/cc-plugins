import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, sep } from "node:path";
import { Env, UsageError, runPaths } from "./layout";

export interface DispatchRequest {
  name: string;
  model: string;
  effort?: string;
  repoRoot: string;
  baseRef: string;
  ticket: string;
}

const VALUE_FLAGS = new Set(["--name", "--model", "--effort", "--repo", "--base", "--ticket", "--ticket-file"]);

function parseFlags(args: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (!VALUE_FLAGS.has(flag)) throw new UsageError(`unknown argument "${flag}"`);
    if (args[i + 1] === undefined) throw new UsageError(`${flag} needs a value`);
    flags.set(flag, args[i + 1]);
  }
  return flags;
}

function gitWorkTree(repo: string): string {
  const refuse = () => new UsageError(`--repo "${repo}" is not a git work tree`);
  let root: string;
  try {
    root = realpathSync(repo);
  } catch {
    throw refuse();
  }
  const inside = spawnSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  if (inside.status !== 0 || inside.stdout.trim() !== "true") throw refuse();
  return root;
}

// The worker's sandbox leaves the system temp directories writable, so a repo or run directory there is not fenced.
function realpathOfExisting(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : realpathOfExisting(parent);
  }
}

function refuseUnderTemp(label: string, path: string, env: Env): void {
  const real = realpathOfExisting(path);
  for (const root of ["/tmp", "/private/tmp", env.TMPDIR]) {
    if (!root) continue;
    const realRoot = realpathOfExisting(root);
    if (real === realRoot || real.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep)) {
      throw new UsageError(`${label} "${path}" is under the temp directory ${realRoot}, which the worker's sandbox can write; use a path elsewhere`);
    }
  }
}

function resolvesToCommit(repoRoot: string, ref: string): boolean {
  const r = spawnSync("git", ["-C", repoRoot, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
    stdio: "ignore",
  });
  return r.status === 0;
}

function branchExists(repoRoot: string, branch: string): boolean {
  const r = spawnSync("git", ["-C", repoRoot, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
    stdio: "ignore",
  });
  return r.status === 0;
}

function ticketText(flags: Map<string, string>): string {
  const ticket = flags.get("--ticket");
  const file = flags.get("--ticket-file");
  if (ticket !== undefined && file !== undefined) {
    throw new UsageError("give either --ticket or --ticket-file, not both");
  }
  let text: string;
  if (file !== undefined) {
    try {
      text = readFileSync(file, "utf8");
    } catch {
      throw new UsageError(`--ticket-file "${file}" cannot be read`);
    }
  } else if (ticket !== undefined) {
    text = ticket;
  } else {
    throw new UsageError("one of --ticket or --ticket-file is required");
  }
  if (text.trim() === "") throw new UsageError("ticket is empty");
  return text;
}

export function parseRunArgs(argv: string[], env: Env = { MUSTER_HOME: process.env.MUSTER_HOME, HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR }): DispatchRequest {
  const flags = parseFlags(argv[0] === "run" ? argv.slice(1) : argv);

  const name = flags.get("--name");
  if (!name) throw new UsageError("--name is required");
  const paths = runPaths(name, env);
  refuseUnderTemp("MUSTER_HOME", paths.runDir, env);
  if (existsSync(paths.runDir)) throw new UsageError(`run "${name}" already exists at ${paths.runDir}`);

  const model = flags.get("--model");
  if (model === undefined || model === "") throw new UsageError("--model is required and must name a specific model");
  if (model === "default") throw new UsageError('--model "default" is not allowed; name a specific model');

  const effort = flags.get("--effort");
  if (effort === "") throw new UsageError("--effort needs a value");

  const repo = flags.get("--repo");
  if (!repo) throw new UsageError("--repo is required");
  const repoRoot = gitWorkTree(repo);
  refuseUnderTemp("--repo", repoRoot, env);

  const baseRef = flags.get("--base") ?? "HEAD";
  if (!resolvesToCommit(repoRoot, baseRef)) throw new UsageError(`unknown base ref "${baseRef}"`);

  if (branchExists(repoRoot, `muster/${name}`)) {
    throw new UsageError(`branch muster/${name} already exists in ${repoRoot}; pick another name`);
  }

  const request = { name, model, repoRoot, baseRef, ticket: ticketText(flags) };
  return effort === undefined ? request : { ...request, effort };
}
