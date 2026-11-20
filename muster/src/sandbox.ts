import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { CREDENTIAL_STORES } from "./credential-stores";

export class InvalidAllowHost extends Error {
  override name = "InvalidAllowHost";
  constructor(readonly entry: string) {
    super(`invalid-allow-host: ${entry}`);
  }
}

export const DEFAULT_ALLOWED_HOSTS = ["registry.npmjs.org"] as const;

type Env = Record<string, string | undefined>;

const LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const DOMAIN = new RegExp(`^${LABEL}(?:\\.${LABEL})+$`);

export function resolveAllowedHosts(env: Env): string[] {
  const extra = (env.MUSTER_ALLOW_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "");
  for (const entry of extra) {
    const base = entry.startsWith("*.") ? entry.slice(2) : entry;
    if (!DOMAIN.test(base)) throw new InvalidAllowHost(entry);
  }
  return [...new Set([...DEFAULT_ALLOWED_HOSTS, ...extra])];
}

export { CREDENTIAL_STORES };

// Apple mktemp without a template ignores TMPDIR and writes here; without it every test fixture fails to start.
export function darwinUserTempDir(): string | undefined {
  if (process.platform !== "darwin") return undefined;
  const r = spawnSync("getconf", ["DARWIN_USER_TEMP_DIR"], { encoding: "utf8" });
  const dir = r.status === 0 ? r.stdout.trim() : "";
  return dir === "" ? undefined : dir;
}

// The temp dir a fenced worker's Bash may write, which its file tools may then write without a question.
// Claude Code's own /tmp/claude-<uid> is left out although Bash may write most of it: it holds every session's
// scratch and task files, and Claude Code's sandbox guards paths inside it (claude-settings-*.json, bash-edit-diff,
// the session's tasks directory) by a list muster cannot see, so a file-tool edit there could exceed what Bash can do.
export function workerTempDirs(): string[] {
  return [darwinUserTempDir()].filter((d): d is string => d !== undefined);
}

// allowedHosts is the list resolved when the run was dispatched; every turn passes the same one.
export function sandboxOption(opts: { env: Env; cache: string; allowedHosts: readonly string[]; userTemp?: string }) {
  const home = opts.env.HOME ?? homedir();
  const userTemp = "userTemp" in opts ? opts.userTemp : darwinUserTempDir();
  return {
    enabled: true,
    failIfUnavailable: true,
    autoAllowBashIfSandboxed: true,
    allowUnsandboxedCommands: false,
    network: { allowedDomains: [...opts.allowedHosts], strictAllowlist: true },
    filesystem: { denyRead: CREDENTIAL_STORES.map((p) => join(home, p)), allowWrite: userTemp ? [opts.cache, userTemp] : [opts.cache] },
  };
}
