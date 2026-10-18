// FAKE_AGENT_SCRIPT for a prompt turn. Data keys in FAKE_AGENT_SCENARIO:
//   permission = {toolCall, options?}  sent as session/request_permission after session/prompt
//   writeOnAllow = {path, content}     written only when the client selects an allow_once option
//   stopReason                         answers the prompt (default end_turn)
//   writeReport                        content written to the "Report file:" path named in the prompt
//   modelUsage                         [{model}] answered as _meta.quota.model_usage
//   echoEnv                            writes its own environment to stderr at startup
//   promptDelayMs                      delays the prompt answer
//   termination.exitOnMethod           exits with the given code on that method
//   results["session/new"].configOptions  offered options; set_config_option echoes the value it was given

type Option = { optionId: string; kind: string; name?: string };
type Io = {
  scenario: {
    permission?: { toolCall: unknown; options?: Option[] };
    writeOnAllow?: { path: string; content: string };
    stopReason?: string;
    writeReport?: string;
    modelUsage?: { model: string }[];
    echoEnv?: boolean;
    promptDelayMs?: number;
    errors?: Record<string, string>;
    termination?: { exitOnMethod?: Record<string, number> };
    results?: Record<string, { configOptions?: { id: string }[] }>;
  };
  out: (msg: string | object) => void;
};

const PERMISSION_ID = "perm-1";
const DEFAULT_OPTIONS: Option[] = [
  { optionId: "allow-once", kind: "allow_once", name: "Allow once" },
  { optionId: "reject-once", kind: "reject_once", name: "Reject once" },
];

let promptId: unknown;
const configValues = new Map<string, unknown>();

export function setup(io: Io): void {
  if (io.scenario.echoEnv) process.stderr.write(JSON.stringify(process.env));
}

function answerPrompt(io: Io, id: unknown): void {
  setTimeout(
    () =>
      io.out({
        jsonrpc: "2.0",
        id,
        result: {
          stopReason: io.scenario.stopReason ?? "end_turn",
          ...(io.scenario.modelUsage && { _meta: { quota: { model_usage: io.scenario.modelUsage } } }),
        },
      }),
    io.scenario.promptDelayMs ?? 0,
  );
}

export function handle(msg: { id?: unknown; method?: string; params?: any; result?: any }, io: Io): boolean | void {
  const options = io.scenario.permission?.options ?? DEFAULT_OPTIONS;
  const code = msg.method === undefined ? undefined : io.scenario.termination?.exitOnMethod?.[msg.method];
  if (code !== undefined) process.exit(code);

  if (msg.method === "session/set_config_option" && msg.id !== undefined) {
    configValues.set(msg.params?.configId, msg.params?.value);
    const offered = io.scenario.results?.["session/new"]?.configOptions ?? [];
    const configOptions = offered.map((o) => (configValues.has(o.id) ? { ...o, currentValue: configValues.get(o.id) } : o));
    io.out({ jsonrpc: "2.0", id: msg.id, result: { configOptions } });
    return true;
  }

  if (msg.method === "session/prompt" && msg.id !== undefined) {
    promptId = msg.id;
    if (io.scenario.permission) {
      io.out({
        jsonrpc: "2.0",
        id: PERMISSION_ID,
        method: "session/request_permission",
        params: { sessionId: msg.params?.sessionId, toolCall: io.scenario.permission.toolCall, options },
      });
      return true;
    }
    if (io.scenario.errors?.["session/prompt"] !== undefined) return undefined;
    const text: string = msg.params?.prompt?.[0]?.text ?? "";
    const reportPath = /^Report file: (.+)$/m.exec(text)?.[1];
    if (io.scenario.writeReport !== undefined && reportPath !== undefined) {
      void Bun.write(reportPath, io.scenario.writeReport).then(() => answerPrompt(io, msg.id));
    } else {
      answerPrompt(io, msg.id);
    }
    return true;
  }

  if (msg.id === PERMISSION_ID && msg.method === undefined) {
    const outcome = msg.result?.outcome;
    const allowed =
      outcome?.outcome === "selected" &&
      options.some((o) => o.optionId === outcome.optionId && o.kind === "allow_once");
    const write = io.scenario.writeOnAllow;
    if (allowed && write) {
      void Bun.write(write.path, write.content).then(() => answerPrompt(io, promptId));
    } else {
      answerPrompt(io, promptId);
    }
    return true;
  }
  return undefined;
}
