import type { Channel } from "./channel";

export class ModelRefused extends Error {
  override name = "ModelRefused";
}

type ConfigOption = { id: string; category?: string; currentValue?: unknown; options?: unknown[] };

const MAX_LISTED = 20;

type Offered = { value: string; name?: string };

function flatten(entries: unknown[]): Offered[] {
  const offered: Offered[] = [];
  for (const entry of entries) {
    const e = entry as { value?: unknown; name?: unknown; options?: unknown[] };
    if (Array.isArray(e.options)) offered.push(...flatten(e.options));
    else if (typeof e.value === "string")
      offered.push({ value: e.value, name: typeof e.name === "string" ? e.name : undefined });
  }
  return offered;
}

// The adapter offers the newest models only under an alias (opus is "Opus 5.5" while
// claude-opus-5 is "Opus 5"), so a value alone misleads the coordinator into an older model.
function label(o: Offered): string {
  return o.name && o.name !== o.value ? `${o.value} (${o.name})` : o.value;
}

function refuse(reason: string, offered: Offered[]): ModelRefused {
  const listed = offered.slice(0, MAX_LISTED).map(label).join(", ");
  return new ModelRefused(`${reason}; offered: [${listed}]`);
}

function optionIn(options: unknown, category: string): ConfigOption | undefined {
  return (Array.isArray(options) ? (options as ConfigOption[]) : []).find((o) => o.category === category);
}

async function gateOption(
  channel: Channel,
  opts: { sessionId: string; configOptions: unknown; category: string; label: string; requested: string },
): Promise<unknown> {
  const option = optionIn(opts.configOptions, opts.category);
  if (!option) throw refuse(`adapter offers no ${opts.label} option`, []);
  const offered = flatten(option.options ?? []);
  if (!offered.some((o) => o.value === opts.requested)) {
    throw refuse(`requested ${opts.label} ${opts.requested} is not offered`, offered);
  }
  let response: unknown;
  try {
    response = await channel.request("session/set_config_option", {
      sessionId: opts.sessionId,
      configId: option.id,
      value: opts.requested,
    });
  } catch (e) {
    throw refuse(`set_config_option failed: ${(e as Error).message}`, offered);
  }
  const configOptions = (response as { configOptions?: unknown } | null)?.configOptions;
  const after = optionIn(configOptions, opts.category);
  if (after?.currentValue !== opts.requested) {
    throw refuse(`adapter reports ${opts.label} ${String(after?.currentValue)}, not ${opts.requested}`, offered);
  }
  return configOptions;
}

export function gateModel(
  channel: Channel,
  opts: { sessionId: string; configOptions: unknown; requestedModel: string },
): Promise<unknown> {
  return gateOption(channel, { ...opts, category: "model", label: "model", requested: opts.requestedModel });
}

// Effort levels are listed per model, so callers pass the configOptions gateModel returned.
export function gateEffort(
  channel: Channel,
  opts: { sessionId: string; configOptions: unknown; requestedEffort: string },
): Promise<unknown> {
  return gateOption(channel, { ...opts, category: "thought_level", label: "effort", requested: opts.requestedEffort });
}
