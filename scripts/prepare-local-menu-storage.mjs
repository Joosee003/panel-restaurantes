import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

// Restore only the original menu Storage policies into Supabase local.
// The schema-only public dump does not include storage.objects policies/buckets.
const status = JSON.parse(await readFile(new URL("../local-schema/supabase-status.json", import.meta.url), "utf8"));
const target = new URL(status.API_URL);
if (target.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "54321") {
  throw new Error("LOCAL_SUPABASE_ONLY");
}
const psql = "C:\\Users\\Usuario\\Documents\\ChatGPT\\GASTROHELP\\local-only\\pg17\\pgsql\\bin\\psql.exe";
const args = ["-X", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
const env = { ...process.env, PGPASSWORD: "postgres", PGOPTIONS: "-c client_min_messages=error" };
const sql = (query) => execFileSync(psql, [...args, "-Atc", query], { encoding: "utf8", env }).trim();
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const original = JSON.parse(await readFile(new URL("../tests/fixtures/storage-policies-2026-09-16.json", import.meta.url), "utf8"));
const policies = original.filter((row) => row.policyname.startsWith("menus_images_"));
if (policies.length !== 4) throw new Error("ORIGINAL_MENU_STORAGE_POLICIES_INCOMPLETE");

sql("INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('menus','menus',true,8388608,ARRAY['image/webp','image/jpeg','image/png']) ON CONFLICT(id) DO NOTHING");
const existing = new Set(sql("SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects'").split(/\r?\n/));
for (const policy of policies) {
  if (existing.has(policy.policyname)) continue;
  const roles = policy.roles.map(quote).join(", ");
  const using = policy.qual ? ` USING (${policy.qual})` : "";
  const withCheck = policy.with_check ? ` WITH CHECK (${policy.with_check})` : "";
  sql(`CREATE POLICY ${quote(policy.policyname)} ON storage.objects AS ${policy.permissive} FOR ${policy.cmd} TO ${roles}${using}${withCheck}`);
}
const restored = new Set(sql("SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'menus_images_%'").split(/\r?\n/));
if (policies.some((policy) => !restored.has(policy.policyname))) throw new Error("MENU_STORAGE_POLICY_RESTORE_FAILED");
process.stdout.write("Supabase local: bucket menus y 4 políticas originales listos.\n");
