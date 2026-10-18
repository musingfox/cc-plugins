import type { Channel } from "./channel";

export class ModelRefused extends Error {
  override name = "ModelRefused";
}

type ConfigOption = { id: string; category?: string; currentValue?: unknown; options?: unknown[] };

const MAX_LISTED = 20;

function flatten(entries: unknown[]): string[] {
  const values: string[] = [];
  for (const entry of entries) {
    const e = entry as { value?: unknown; options?: unknown[] };
    if (Array.isArray(e.options)) values.push(...flatten(e.options));
    else if (typeof e.value === "string") values.push(e.value);
  }
  return values;
}

function refuse(reason: string, offered: string[]): ModelRefused {
  const listed = offered.slice(0, MAX_LISTED).join(", ");
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
  if (!offered.includes(opts.requestedModel)) {
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
