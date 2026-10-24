// Copy one or more domains' cookies from the everyday Zen profile into the
// running agent Zen over WebDriver BiDi. Usage: bun cookies.ts PORT DOMAIN...
import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [port, ...domains] = process.argv.slice(2);
const zenRoot = join(process.env.HOME!, "Library/Application Support/zen");

// The everyday profile is the install default whose cookies changed last.
function mainProfile(): string {
  if (process.env.ZEN_MAIN_PROFILE) return process.env.ZEN_MAIN_PROFILE;
  const ini = readFileSync(join(zenRoot, "profiles.ini"), "utf8");
  const candidates = [...ini.matchAll(/^\[Install[^\]]*\][^[]*?^Default=(.+)$/gm)]
    .map((m) => join(zenRoot, m[1].trim()))
    .filter((p) => existsSync(join(p, "cookies.sqlite")));
  if (!candidates.length) throw new Error(`no Zen profile with cookies under ${zenRoot}`);
  const mtime = (p: string) => statSync(join(p, "cookies.sqlite")).mtimeMs;
  return candidates.sort((a, b) => mtime(b) - mtime(a))[0];
}

type Row = { name: string; value: string; host: string; path: string; expiry: number;
  isSecure: number; isHttpOnly: number; sameSite: number };

// Zen holds an exclusive lock on its cookie database, so read a copy and
// delete it before exiting: it carries every session the user has.
function readCookies(profile: string): Row[] {
  const dir = mkdtempSync(join(tmpdir(), "zen-agent-cookies-"));
  try {
    for (const f of ["cookies.sqlite", "cookies.sqlite-wal"]) {
      if (existsSync(join(profile, f))) copyFileSync(join(profile, f), join(dir, f));
    }
    const db = new Database(join(dir, "cookies.sqlite"));
    const q = db.query<Row, [string, string]>(
      "select name, value, host, path, expiry, isSecure, isHttpOnly, sameSite from moz_cookies where host = ? or host like ?");
    const rows = domains.flatMap((d) => q.all(d, `%.${d}`));
    db.close();
    return rows;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const rows = readCookies(mainProfile());
const ws = new WebSocket(`ws://127.0.0.1:${port}/session`);
let id = 0;
const pending = new Map<number, (m: any) => void>();
ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); pending.get(m.id)?.(m); pending.delete(m.id); };
const send = (method: string, params = {}) =>
  new Promise<any>((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

const session = await send("session.new", { capabilities: {} });
if (session.type !== "success") {
  console.error("zen-agent: the agent Zen is held by another client (usually the zen MCP server).\n" +
    "Call the close_firefox_session tool first, then run this again.");
  ws.close();
  process.exit(3);
}
const sameSite = ["none", "lax", "strict"];
let injected = 0;
try {
  for (const c of rows) {
    // Newer Firefox stores expiry in milliseconds; BiDi wants seconds.
    const expiry = c.expiry > 1e11 ? Math.floor(c.expiry / 1000) : c.expiry;
    const r = await send("storage.setCookie", { cookie: {
      name: c.name, value: { type: "string", value: c.value }, domain: c.host, path: c.path,
      secure: !!c.isSecure, httpOnly: !!c.isHttpOnly, sameSite: sameSite[c.sameSite] ?? "none", expiry } });
    if (r.type === "success") injected++;
    else console.error(`zen-agent: ${c.host} ${c.name}: ${r.error}`);
  }
} finally {
  await send("session.end");
  ws.close();
}
console.log(`zen-agent: copied ${injected}/${rows.length} cookies for ${domains.join(", ")}`);
process.exit(injected === rows.length ? 0 : 1);
