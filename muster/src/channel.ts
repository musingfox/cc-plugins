import { appendFile } from "node:fs/promises";
import { closeSync, openSync } from "node:fs";

export class LaunchError extends Error {
  override name = "LaunchError";
}

type Dir = "out" | "in" | "in-raw" | "client-decision";

export type OpenOptions = {
  argv: string[];
  env?: Record<string, string>;
  cwd?: string;
  eventsPath: string;
  stderrPath: string;
};

type Handler = (params: unknown, id: string | number) => unknown | Promise<unknown>;

export type Channel = {
  request(method: string, params?: unknown): Promise<unknown>;
  notify(method: string, params?: unknown): Promise<void>;
  onRequest(method: string, handler: Handler): void;
  onNotification(method: string, handler: NotificationHandler): void;
  logDecision(msg: object): Promise<void>;
  close(): Promise<void>;
  pid: number;
  exited: Promise<number>;
};

type NotificationHandler = (params: unknown) => void | Promise<void>;

type Pending = { resolve: (value: unknown) => void; reject: (err: Error) => void };

export async function openChannel(opts: OpenOptions): Promise<Channel> {
  const stderrFd = openSync(opts.stderrPath, "w");
  let proc: Bun.Subprocess<"pipe", "pipe", "number">;
  try {
    proc = Bun.spawn(opts.argv, {
      stdin: "pipe",
      stdout: "pipe",
      stderr: stderrFd,
      cwd: opts.cwd,
      env: opts.env,
    });
  } catch (e) {
    closeSync(stderrFd);
    throw new LaunchError(`failed to launch ${opts.argv[0]}: ${(e as Error).message}`);
  }
  closeSync(stderrFd);

  const pending = new Map<string | number, Pending>();
  let nextId = 1;
  let closed = false;
  let chain: Promise<void> = Promise.resolve();
  const handlers = new Map<string, Handler>();
  const observers = new Map<string, NotificationHandler>();

  const rejectAll = (err: Error) => {
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };

  const record = (dir: Dir, msg: unknown): Promise<void> => {
    const line = JSON.stringify({ t: new Date().toISOString(), dir, msg }) + "\n";
    chain = chain
      .then(() => appendFile(opts.eventsPath, line))
      .catch((e: Error) => {
        rejectAll(e);
        throw e;
      });
    return chain;
  };

  const write = async (dir: Dir, msg: object) => {
    await record(dir, msg);
    proc.stdin.write(JSON.stringify(msg) + "\n");
    proc.stdin.flush();
  };

  const answer = async (req: { id: string | number; method: string; params?: unknown }) => {
    const handler = handlers.get(req.method);
    let body: object;
    if (!handler) {
      body = { jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `method not supported: ${req.method}` } };
    } else {
      try {
        body = { jsonrpc: "2.0", id: req.id, result: await handler(req.params, req.id) };
      } catch (e) {
        body = { jsonrpc: "2.0", id: req.id, error: { code: -32603, message: (e as Error).message } };
      }
    }
    await write("out", body).catch(() => {});
  };

  // The observer sees the notification after it is recorded; a failing handler must not stop the read loop.
  const observe = (method: string, params: unknown) => {
    const handler = observers.get(method);
    if (!handler) return;
    try {
      void Promise.resolve(handler(params)).catch(() => {});
    } catch {
      // Swallowed: the channel keeps reading.
    }
  };

  const handleLine = async (raw: string) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      await record("in-raw", raw).catch(() => {});
      return;
    }
    await record("in", msg).catch(() => {});
    if (msg.method !== undefined && msg.id !== undefined) {
      void answer(msg as { id: string | number; method: string; params?: unknown });
    } else if (msg.method === undefined && msg.id !== undefined) {
      const p = pending.get(msg.id as string | number);
      if (!p) return;
      pending.delete(msg.id as string | number);
      if (msg.error) {
        p.reject(new Error((msg.error as { message: string }).message));
      } else {
        p.resolve(msg.result);
      }
    } else if (msg.method !== undefined) {
      observe(msg.method as string, msg.params);
    }
  };

  const readLoop = (async () => {
    const decoder = new TextDecoder();
    let buf = "";
    for await (const chunk of proc.stdout) {
      buf += decoder.decode(chunk, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line.trim()) await handleLine(line);
      }
    }
    if (buf.trim()) await handleLine(buf);
    closed = true;
    rejectAll(new Error("channel closed before response"));
  })();
  readLoop.catch((e: Error) => rejectAll(e));

  return {
    request(method, params) {
      if (closed) return Promise.reject(new Error("channel closed"));
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        write("out", { jsonrpc: "2.0", id, method, params }).catch(() => {});
      });
    },
    onRequest(method, handler) {
      handlers.set(method, handler);
    },
    onNotification(method, handler) {
      observers.set(method, handler);
    },
    logDecision(msg) {
      return record("client-decision", msg).catch(() => {});
    },
    async notify(method, params) {
      await write("out", { jsonrpc: "2.0", method, params });
    },
    async close() {
      proc.kill();
      await proc.exited;
    },
    pid: proc.pid,
    exited: proc.exited,
  };
}
