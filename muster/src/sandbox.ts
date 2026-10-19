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

const CREDENTIAL_STORES = [
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

export function sandboxOption(opts: { env: Env; cache: string }) {
  const home = opts.env.HOME ?? homedir();
  return {
    enabled: true,
    failIfUnavailable: true,
    autoAllowBashIfSandboxed: true,
    allowUnsandboxedCommands: false,
    network: { allowedDomains: resolveAllowedHosts(opts.env), strictAllowlist: true },
    filesystem: { denyRead: CREDENTIAL_STORES.map((p) => join(home, p)), allowWrite: [opts.cache] },
  };
}
