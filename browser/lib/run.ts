// Run an agent-written puppeteer script against the running agent Zen over
// WebDriver BiDi. Usage: bun run.ts PORT SCRIPT
// SCRIPT default-exports async ({ browser }) => result; the result prints as JSON.
import puppeteer, { type Browser } from "puppeteer-core";
import { resolve } from "node:path";

const [port, script] = process.argv.slice(2);

let browser: Browser;
try {
  browser = await puppeteer.connect({
    browserWSEndpoint: `ws://127.0.0.1:${port}/session`,
    protocol: "webDriverBiDi",
  });
} catch (e) {
  if (!String(e).includes("Maximum number of active sessions")) throw e;
  console.error("zen-agent: the agent Zen is held by another client (usually the zen MCP server).\n" +
    "Call the close_firefox_session tool first, then run this again.");
  process.exit(3);
}

// Firefox keeps a BiDi session alive after its socket drops, so a run that
// exits without disconnecting locks every later client out until a restart.
const release = () => browser.disconnect().catch(() => {});
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, async () => { await release(); process.exit(130); });
}

let code = 0;
try {
  const { default: run } = await import(resolve(script));
  const result = await run({ browser });
  if (result !== undefined) console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  code = 1;
} finally {
  await release();
}
process.exit(code);
