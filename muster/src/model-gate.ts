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

function modelOption(options: unknown): ConfigOption | undefined {
  return (Array.isArray(options) ? (options as ConfigOption[]) : []).find((o) => o.category === "model");
}

export async function gateModel(
  channel: Channel,
  opts: { sessionId: string; configOptions: unknown; requestedModel: string },
): Promise<void> {
  const option = modelOption(opts.configOptions);
  if (!option) throw refuse("adapter offers no model option", []);
  const offered = flatten(option.options ?? []);
  if (!offered.some((o) => o.value === opts.requestedModel)) {
    throw refuse(`requested model ${opts.requestedModel} is not offered`, offered);
  }
  let response: unknown;
  try {
    response = await channel.request("session/set_config_option", {
      sessionId: opts.sessionId,
      configId: option.id,
      value: opts.requestedModel,
    });
  } catch (e) {
    throw refuse(`set_config_option failed: ${(e as Error).message}`, offered);
  }
  const after = modelOption((response as { configOptions?: unknown } | null)?.configOptions);
  if (after?.currentValue !== opts.requestedModel) {
    throw refuse(`adapter reports model ${String(after?.currentValue)}, not ${opts.requestedModel}`, offered);
  }
}
