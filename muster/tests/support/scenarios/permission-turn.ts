// FAKE_AGENT_SCRIPT for a single prompt turn. Data keys in FAKE_AGENT_SCENARIO:
//   permission = {toolCall, options?}  sent as session/request_permission after session/prompt
//   writeOnAllow = {path, content}     written only when the client selects an allow_once option
//   stopReason                         answers the prompt once the permission reply arrives

type Option = { optionId: string; kind: string; name?: string };
type Io = {
  scenario: {
    permission?: { toolCall: unknown; options?: Option[] };
    writeOnAllow?: { path: string; content: string };
    stopReason?: string;
  };
  out: (msg: string | object) => void;
};

const PERMISSION_ID = "perm-1";
const DEFAULT_OPTIONS: Option[] = [
  { optionId: "allow-once", kind: "allow_once", name: "Allow once" },
  { optionId: "reject-once", kind: "reject_once", name: "Reject once" },
];

let promptId: unknown;

export function handle(msg: { id?: unknown; method?: string; params?: any; result?: any }, io: Io): boolean | void {
  const options = io.scenario.permission?.options ?? DEFAULT_OPTIONS;
  if (msg.method === "session/prompt" && msg.id !== undefined) {
    promptId = msg.id;
    io.out({
      jsonrpc: "2.0",
      id: PERMISSION_ID,
      method: "session/request_permission",
      params: { sessionId: msg.params?.sessionId, toolCall: io.scenario.permission?.toolCall, options },
    });
    return true;
  }
  if (msg.id === PERMISSION_ID && msg.method === undefined) {
    const outcome = msg.result?.outcome;
    const allowed =
      outcome?.outcome === "selected" &&
      options.some((o) => o.optionId === outcome.optionId && o.kind === "allow_once");
    const write = io.scenario.writeOnAllow;
    if (allowed && write) {
      void Bun.write(write.path, write.content).then(() => {
        io.out({ jsonrpc: "2.0", id: promptId, result: { stopReason: io.scenario.stopReason ?? "end_turn" } });
      });
    } else {
      io.out({ jsonrpc: "2.0", id: promptId, result: { stopReason: io.scenario.stopReason ?? "end_turn" } });
    }
    return true;
  }
  return undefined;
}
