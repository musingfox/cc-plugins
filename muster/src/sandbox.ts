import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

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

export const CREDENTIAL_STORES = [
  ".npmrc",
  ".config/gh",
  ".git-credentials",
  ".config/git/credentials",
  ".netrc",
  ".aws",
  ".docker/config.json",
  "Library/Keychains",
  ".ssh",
  ".pi",
  ".config/gcloud",
  ".kube",
  ".cargo/credentials.toml",
  ".pypirc",
];

// Apple mktemp without a template ignores TMPDIR and writes here; without it every test fixture fails to start.
function darwinUserTempDir(): string | undefined {
  if (process.platform !== "darwin") return undefined;
  const r = spawnSync("getconf", ["DARWIN_USER_TEMP_DIR"], { encoding: "utf8" });
  const dir = r.status === 0 ? r.stdout.trim() : "";
  return dir === "" ? undefined : dir;
}

export function sandboxOption(opts: { env: Env; cache: string; userTemp?: string }) {
  const home = opts.env.HOME ?? homedir();
  const userTemp = "userTemp" in opts ? opts.userTemp : darwinUserTempDir();
  return {
    enabled: true,
    failIfUnavailable: true,
    autoAllowBashIfSandboxed: true,
    allowUnsandboxedCommands: false,
    network: { allowedDomains: resolveAllowedHosts(opts.env), strictAllowlist: true },
    filesystem: { denyRead: CREDENTIAL_STORES.map((p) => join(home, p)), allowWrite: userTemp ? [opts.cache, userTemp] : [opts.cache] },
  };
}
