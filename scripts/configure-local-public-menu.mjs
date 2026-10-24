import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(await readFile(new URL("../local-schema/supabase-status.json", import.meta.url), "utf8"));
const fixture = JSON.parse(await readFile(new URL("../local-schema/fixture-credentials.json", import.meta.url), "utf8"));
const url = new URL(status.API_URL);
if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54321") {
  throw new Error("LOCAL_SUPABASE_ONLY");
}
const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await service.from("cartas_digitales")
  .select("public_token")
  .eq("restaurante_id", fixture.restaurants.newTalgo)
  .limit(1)
  .single();
if (error || !/^[a-zA-Z0-9]{32}$/.test(data?.public_token || "")) throw new Error("LOCAL_MENU_TOKEN_UNAVAILABLE");
const envPath = new URL("../.env.local", import.meta.url);
const original = await readFile(envPath, "utf8");
const line = `NEW_TALGO_PUBLIC_MENU_TOKEN=${data.public_token}`;
const updated = /^NEW_TALGO_PUBLIC_MENU_TOKEN=.*$/m.test(original)
  ? original.replace(/^NEW_TALGO_PUBLIC_MENU_TOKEN=.*$/m, line)
  : `${original.trimEnd()}\n${line}\n`;
await writeFile(envPath, updated, "utf8");
process.stdout.write("Local New Talgo menu token configured in ignored .env.local.\n");
