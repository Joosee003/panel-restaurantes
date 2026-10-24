import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const status = JSON.parse(await readFile(join(root, "local-schema", "supabase-status.json"), "utf8"));
const fixture = JSON.parse(await readFile(join(root, "local-schema", "fixture-credentials.json"), "utf8"));
const url = new URL(status.API_URL);
if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54321") {
  throw new Error("LOCAL_SUPABASE_ONLY");
}
const appUrl = new URL(process.env.GH_LOCAL_APP_URL || "http://127.0.0.1:4176");
if (appUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(appUrl.hostname)
  || !appUrl.port || appUrl.pathname !== "/" || appUrl.search || appUrl.hash) throw new Error("LOCAL_APP_ONLY");
const envPath = join(root, ".env.local");
const previous = await readFile(envPath, "utf8").catch(() => "");
const retained = Object.fromEntries(previous.split(/\r?\n/).flatMap(line => {
  const equal = line.indexOf("=");
  return equal > 0 && /^[A-Z][A-Z0-9_]*$/.test(line.slice(0, equal))
    ? [[line.slice(0, equal), line.slice(equal + 1)]] : [];
}));
const variables = {
  ...retained,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SITE_URL: appUrl.origin,
  NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID: fixture.restaurants.newTalgo,
  NEXT_PUBLIC_WHITE_LABEL_MESA_NORTE_ID: fixture.restaurants.mesaNorte,
};
await writeFile(envPath, Object.entries(variables)
  .map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
process.stdout.write("Configuración local aislada escrita en .env.local (ignorado por Git).\n");
