// Scenario-driven stand-in for an ACP agent. Reads newline-delimited JSON-RPC on stdin.
// FAKE_AGENT_SCENARIO (JSON): { stderr?: string, startup?: (string | object)[] }
//   startup items are written to stdout before any request is read; strings go out raw.
// Requests: "fake/emit" writes params.messages to stdout, then replies {};
//           any other request is answered with {echo: params} after params.delayMs.

const scenario = JSON.parse(process.env.FAKE_AGENT_SCENARIO ?? "{}") as {
  stderr?: string;
  startup?: (string | object)[];
};

const out = (msg: string | object) =>
  process.stdout.write((typeof msg === "string" ? msg : JSON.stringify(msg)) + "\n");

if (scenario.stderr) process.stderr.write(scenario.stderr);
for (const item of scenario.startup ?? []) out(item);

type Msg = { id?: unknown; method?: string; params?: any };

function handle(msg: Msg) {
  if (msg.id === undefined || msg.method === undefined) return;
  if (msg.method === "fake/emit") {
    for (const m of msg.params?.messages ?? []) out(m);
    out({ jsonrpc: "2.0", id: msg.id, result: {} });
    return;
  }
  setTimeout(
    () => out({ jsonrpc: "2.0", id: msg.id, result: { echo: msg.params ?? null } }),
    msg.params?.delayMs ?? 0,
  );
}

const decoder = new TextDecoder();
let buf = "";
for await (const chunk of Bun.stdin.stream()) {
  buf += decoder.decode(chunk, { stream: true });
  let i: number;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (line.trim()) handle(JSON.parse(line));
  }
}
