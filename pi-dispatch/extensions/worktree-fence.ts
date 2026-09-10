// worktree-fence.ts — pi extension: keep a dispatched worker's write/edit inside PI_CWD.
//
// Loaded by pi-dispatch.sh via `-e` whenever PI_CWD is set; a no-op otherwise, so
// an interactive pi is untouched. Git mutations are fenced by shims/git, which
// sees the shell-expanded argv; this file only covers the write and edit tools,
// whose paths arrive as plain strings.
//
// Returns { block, reason } without `terminate`, so the worker rewrites the call.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

// macOS /tmp is a symlink to /private/tmp: realpath the deepest existing ancestor,
// then re-append what does not exist yet.
export function canon(p: string): string {
  let head = p;
  let tail = "";
  while (!existsSync(head)) {
    const parent = dirname(head);
    if (parent === head) return p;
    tail = head.slice(parent.length) + tail;
    head = parent;
  }
  return realpathSync(head) + tail;
}

export function inside(canonWork: string, p: string): boolean {
  const c = canon(p);
  return c === canonWork || c.startsWith(canonWork + sep);
}

export type Verdict = { block: true; reason: string } | undefined;

export function checkToolCall(toolName: string, input: any, canonWork: string): Verdict {
  if (toolName !== "write" && toolName !== "edit") return undefined;
  const raw = input?.path;
  if (typeof raw !== "string" || !raw) return undefined;
  // Mirror pi's own resolution for write/edit: a leading "@" is stripped and "~"
  // expands to $HOME, so neither can smuggle a path past the worktree check.
  const p = raw.replace(/^@/, "").replace(/^~(?=\/|$)/, process.env.HOME ?? "~");
  const abs = resolve(canonWork, p);
  if (inside(canonWork, abs)) return undefined;
  return {
    block: true,
    reason: `BLOCKED by worktree-fence: ${toolName} to ${abs}, outside your worktree ${canonWork}. All writes stay inside the worktree.`,
  };
}

export default function (pi: ExtensionAPI) {
  const work = process.env.PI_CWD;
  if (!work) return;
  const canonWork = canon(work);
  pi.on("tool_call", async (event) => checkToolCall(event.toolName, event.input, canonWork));
}
