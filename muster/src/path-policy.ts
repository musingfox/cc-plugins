import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { CREDENTIAL_STORES } from "./credential-stores";

export type ToolCall = {
  kind: string;
  locations?: Array<{ path?: unknown }>;
  rawInput?: Record<string, unknown>;
};

// A file tool outside the worktree gets what the worker's fenced Bash already has: reads of anything but the
// credential stores under home, and writes to the temp roots. Without home or tempRoots those requests ask.
export type PathContext = {
  worktreeReal: string;
  home?: string;
  tempRoots?: readonly string[];
  runsDir?: string;
};

export type Decision = { allow: true } | { allow: false; reason: string };

const ALWAYS_ASK_DIRS = [".git", ".claude"] as const;

const PATH_KEYS = ["file_path", "notebook_path", "path"] as const;


export function realpathDeepest(p: string): string {
  let existing = p;
  const rest: string[] = [];
  for (;;) {
    try {
      lstatSync(existing);
      break;
    } catch {
      const parent = dirname(existing);
      if (parent === existing) break;
      rest.unshift(basename(existing));
      existing = parent;
    }
  }
  return join(realpathSync.native(existing), ...rest);
}

export function resolveRequestPath(p: string, worktreeReal: string): string {
  return realpathDeepest(resolve(worktreeReal, p));
}

function within(p: string, root: string): boolean {
  return p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);
}

export function insideWorktree(p: string, worktreeReal: string): boolean {
  return within(p, worktreeReal);
}

// Case-folded so a case-insensitive volume cannot spell a store another way; a path above a store asks too,
// because a directory read there would reach into it.
function credentialStoreReached(real: string, home: string): string | undefined {
  const p = real.toLowerCase();
  for (const rel of CREDENTIAL_STORES) {
    const literal = join(home, rel);
    for (const store of new Set([literal, realpathDeepest(literal)])) {
      const s = store.toLowerCase();
      if (within(p, s) || within(s, p)) return store;
    }
  }
  return undefined;
}

// A relative home or root would resolve against the cwd, so only absolute ones widen anything. A search is
// left out: its pattern or glob can name paths beyond the one checked here.
function askOutsideWorktree(kind: string, real: string, ctx: PathContext): string | undefined {
  if (kind === "read" && ctx.home !== undefined && isAbsolute(ctx.home)) {
    const store = credentialStoreReached(real, ctx.home);
    return store ? `path reaches the credential store ${store}: ${real}` : undefined;
  }
  if (kind === "edit" && ctx.tempRoots !== undefined && (ctx.runsDir === undefined || isAbsolute(ctx.runsDir))) {
    if (ctx.runsDir !== undefined && within(real.toLowerCase(), realpathDeepest(ctx.runsDir).toLowerCase())) {
      return `path is inside the muster runs directory: ${real}`;
    }
    const roots = ctx.tempRoots.filter((root) => isAbsolute(root)).map(realpathDeepest);
    if (roots.some((root) => within(real, root))) return undefined;
    return `path is outside the worktree and the temp directories: ${real}`;
  }
  return `path is outside the worktree: ${real}`;
}

function candidatePaths(toolCall: ToolCall): string[] {
  const out: string[] = [];
  for (const loc of toolCall.locations ?? []) {
    if (typeof loc.path === "string") out.push(loc.path);
  }
  for (const key of PATH_KEYS) {
    const v = toolCall.rawInput?.[key];
    if (typeof v === "string") out.push(v);
  }
  return out;
}

export function decidePath(toolCall: ToolCall, ctx: PathContext): Decision {
  try {
    const candidates = candidatePaths(toolCall);
    if (candidates.length === 0) {
      return { allow: false, reason: "request names no path" };
    }

    const worktreeReal = ctx.worktreeReal;
    const askDirs = ALWAYS_ASK_DIRS.map((d) => join(worktreeReal, d));

    const resolved = [...new Set(candidates.map((c) => resolveRequestPath(c, worktreeReal)))];

    for (const real of resolved) {
      const dir = askDirs.find((d) => real === d || real.startsWith(d + sep));
      if (dir) return { allow: false, reason: `path is inside ${basename(dir)}: ${real}` };
    }

    for (const real of resolved) {
      if (insideWorktree(real, worktreeReal)) continue;
      const reason = askOutsideWorktree(toolCall.kind, real, ctx);
      if (reason) return { allow: false, reason };
    }
    return { allow: true };
  } catch (err) {
    return { allow: false, reason: `path could not be checked: ${String(err)}` };
  }
}

export function danglingLinkTargetOutside(p: string, worktreeReal: string): string | undefined {
  const link = resolve(worktreeReal, p);
  try {
    if (!lstatSync(link).isSymbolicLink()) return undefined;
    const target = realpathDeepest(resolve(dirname(link), readlinkSync(link)));
    return insideWorktree(target, worktreeReal) ? undefined : target;
  } catch {
    return undefined;
  }
}
