import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

export type ToolCall = {
  kind: string;
  locations?: Array<{ path?: unknown }>;
  rawInput?: Record<string, unknown>;
};

export type PathContext = { worktreeReal: string };

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

export function insideWorktree(p: string, worktreeReal: string): boolean {
  return p === worktreeReal || p.startsWith(worktreeReal + sep);
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
      if (!insideWorktree(real, worktreeReal)) {
        return { allow: false, reason: `path is outside the worktree: ${real}` };
      }
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
