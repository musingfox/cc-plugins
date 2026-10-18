type Io = { scenario: { termination?: { exitOnMethod?: Record<string, number>; trapSigterm?: boolean } } };

export function setup(io: Io): void {
  if (io.scenario.termination?.trapSigterm) process.on("SIGTERM", () => {});
}

export function handle(msg: { method?: string }, io: Io): void {
  const code = msg.method === undefined ? undefined : io.scenario.termination?.exitOnMethod?.[msg.method];
  if (code !== undefined) process.exit(code);
}
