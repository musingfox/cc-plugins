// Scenario-driven stand-in for an ACP agent. Reads newline-delimited JSON-RPC on stdin.
// FAKE_AGENT_SCENARIO (JSON): { stderr?: string, startup?: (string | object)[],
//   results?: {method: result}, errors?: {method: message}, silent?: string[],
//   termination?: { exitOnMethod?: {method: code}, trapSigterm?: boolean } }
//   startup items are written to stdout before any request is read; strings go out raw.
//   results/errors override the reply per method; silent methods are never answered.
// Requests: "fake/emit" writes params.messages to stdout, then replies {};
//           any other request is answered with {echo: params} after params.delayMs.
// FAKE_AGENT_SCRIPT (module path, optional): exports setup(io), run before stdin is read,
//   and handle(msg, io), run for every inbound message; returning true skips the base handling.

type Scenario = {
  stderr?: string;
  startup?: (string | object)[];
  results?: Record<string, unknown>;
  errors?: Record<string, string>;
  silent?: string[];
  termination?: { exitOnMethod?: Record<string, number>; trapSigterm?: boolean };
};

const scenario = JSON.parse(process.env.FAKE_AGENT_SCENARIO ?? "{}") as Scenario;

const out = (msg: string | object) =>
  process.stdout.write((typeof msg === "string" ? msg : JSON.stringify(msg)) + "\n");

type Msg = { id?: unknown; method?: string; params?: any };
type Io = { scenario: Scenario; out: (msg: string | object) => void };

const io: Io = { scenario, out };
const script = process.env.FAKE_AGENT_SCRIPT
  ? ((await import(process.env.FAKE_AGENT_SCRIPT)) as {
      setup?: (io: Io) => void;
      handle?: (msg: Msg, io: Io) => boolean | void;
    })
  : undefined;
script?.setup?.(io);

if (scenario.stderr) process.stderr.write(scenario.stderr);
for (const item of scenario.startup ?? []) out(item);

function handle(msg: Msg) {
  if (script?.handle?.(msg, io) === true) return;
  if (msg.id === undefined || msg.method === undefined) return;
  if (msg.method === "fake/emit") {
    for (const m of msg.params?.messages ?? []) out(m);
    out({ jsonrpc: "2.0", id: msg.id, result: {} });
    return;
  }
  if (scenario.silent?.includes(msg.method)) return;
  const error = scenario.errors?.[msg.method];
  if (error !== undefined) {
    out({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: error } });
    return;
  }
  const result = scenario.results?.[msg.method] ?? { echo: msg.params ?? null };
  setTimeout(
    () => out({ jsonrpc: "2.0", id: msg.id, result }),
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
