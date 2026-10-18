import type { Channel } from "./channel";

export class ModeRefused extends Error {
  override name = "ModeRefused";
}

export type ConfigOption = { id?: string; category?: string; currentValue?: unknown };

export const DEFAULT_MODE = "default";

function modeOption(options: unknown): ConfigOption | undefined {
  if (!Array.isArray(options)) return undefined;
  return (options as ConfigOption[]).find((o) => o?.category === "mode");
}

export async function enforceDefaultMode(
  channel: Channel,
  opts: { configOptions: unknown; sessionId: string },
): Promise<void> {
  const current = modeOption(opts.configOptions);
  if (!current?.id) throw new ModeRefused("no mode-category option in session configOptions");

  let result: { configOptions?: unknown } | null;
  try {
    result = (await channel.request("session/set_config_option", {
      sessionId: opts.sessionId,
      configId: current.id,
      value: DEFAULT_MODE,
    })) as { configOptions?: unknown } | null;
  } catch (e) {
    throw new ModeRefused(`set_config_option failed: ${(e as Error).message}`);
  }

  const after = modeOption(result?.configOptions);
  if (after?.currentValue !== DEFAULT_MODE) {
    throw new ModeRefused(`mode is ${String(after?.currentValue ?? "unknown")}, expected ${DEFAULT_MODE}`);
  }
}
