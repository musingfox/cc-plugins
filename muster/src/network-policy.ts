export type NetworkDecision = { decision: "allow" | "deny"; host?: string; reason: string };

type NetworkToolCall = { kind?: string; title?: string; rawInput?: unknown };

const IPV4 = /^\d+\.\d+\.\d+\.\d+$/;

function hostOf(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  return parsed.hostname.toLowerCase();
}

function allowedBy(host: string, allowedHosts: string[]): boolean {
  if (host.startsWith("[") || IPV4.test(host)) return false;
  return allowedHosts.some((entry) =>
    entry.startsWith("*.") ? host.endsWith(entry.slice(1)) : host === entry,
  );
}

function decideFetch(rawInput: unknown, allowedHosts: string[]): NetworkDecision {
  const input = (rawInput ?? {}) as Record<string, unknown>;
  if ("query" in input) return { decision: "deny", reason: "web search is not allowed" };
  const host = hostOf(input.url);
  if (host === undefined) return { decision: "deny", reason: "fetch url is missing or not an http(s) url" };
  if (allowedBy(host, allowedHosts)) return { decision: "allow", host, reason: `host ${host} is on the allowlist` };
  return { decision: "deny", host, reason: `host ${host} is not on the allowlist` };
}

export function decideNetwork(toolCall: NetworkToolCall, allowedHosts: string[]): NetworkDecision | undefined {
  if (toolCall.kind === "fetch") return decideFetch(toolCall.rawInput, allowedHosts);
  if (toolCall.kind !== "other") return undefined;
  const raw = toolCall.rawInput;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const keys = Object.keys(raw);
  const host = (raw as { host?: unknown }).host;
  if (keys.length !== 1 || keys[0] !== "host" || typeof host !== "string" || host === "") return undefined;
  return { decision: "deny", host, reason: `network request to ${host} is not allowed` };
}
