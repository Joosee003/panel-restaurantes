import { readFile } from "node:fs/promises";

// Development-only scheduler. Production must schedule the protected dispatch
// endpoint separately after the owner's mobile receipt has been verified.
const values = Object.fromEntries((await readFile(new URL("../.env.local", import.meta.url), "utf8"))
  .split(/\r?\n/)
  .filter(line => /^[A-Z0-9_]+=/.test(line))
  .map(line => {
    const equal = line.indexOf("=");
    return [line.slice(0, equal), line.slice(equal + 1).replace(/^['"]|['"]$/g, "")];
  }));
if (values.OWNER_NOTICE_MODE !== "local-test" || !values.OWNER_NOTICE_DISPATCH_SECRET ||
  values.OWNER_NOTICE_DISPATCH_SECRET.length < 32) throw new Error("LOCAL_NOTICE_MODE_REQUIRED");

const endpoint = "http://127.0.0.1:4176/api/owner-notices/dispatch";
const once = process.argv.includes("--once");
let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${values.OWNER_NOTICE_DISPATCH_SECRET}` },
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(`DISPATCH_HTTP_${response.status}`);
    const result = await response.json();
    const retried = result.results?.filter(item => item.status !== "delivered").length || 0;
    if (result.claimed || retried) process.stdout.write(`Avisos procesados: ${result.claimed}; pendientes/reintento: ${retried}\n`);
  } catch (error) {
    process.stderr.write(`Avisos locales: ${error instanceof Error ? error.message : "DISPATCH_FAILED"}\n`);
    if (once) process.exitCode = 1;
  } finally {
    running = false;
  }
}
await tick();
if (!once) setInterval(tick, 15_000);
