import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = join(process.cwd(), "local-schema");
const status = JSON.parse(await readFile(join(root, "supabase-status.json"), "utf8"));
const fixture = JSON.parse(await readFile(join(root, "fixture-credentials.json"), "utf8"));
const url = new URL(status.API_URL);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "54321");
const name = "Reserva ficticia desde New Talgo";
async function login(actor) {
  const api = createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await api.auth.signInWithPassword({
    email: fixture.users[actor].email, password: fixture.users[actor].password,
  });
  assert.ifError(error);
  return api;
}
const [newTalgo, mesaNorte, agency] = await Promise.all([
  login("newTalgo"), login("mesaNorte"), login("agency"),
]);
async function visible(api) {
  const { data, error } = await api.from("reservas")
    .select("id,restaurante_id,cliente_id,nombre_cliente,inicio_at")
    .eq("nombre_cliente", name);
  assert.ifError(error);
  return data;
}
const own = await visible(newTalgo);
assert.equal(own.length, 1);
assert.equal(own[0].restaurante_id, fixture.restaurants.newTalgo);
assert.ok(own[0].cliente_id);
assert.deepEqual(await visible(mesaNorte), []);
const admin = await visible(agency);
assert.equal(admin.length, 1);
assert.equal(admin[0].id, own[0].id);
const foreignWrite = await mesaNorte.from("reservas")
  .update({ notas: "No autorizado" }).eq("id", own[0].id).select("id");
assert.ok(foreignWrite.error || foreignWrite.data?.length === 0);
const psql = "C:\\Users\\Usuario\\Documents\\ChatGPT\\GASTROHELP\\local-only\\pg17\\pgsql\\bin\\psql.exe";
const check = spawnSync(psql, ["-X", "-h", "127.0.0.1", "-p", "54322",
  "-U", "postgres", "-d", "postgres", "-Atc",
  `select count(*) from public.reservas where id='${own[0].id}'::uuid and restaurante_id='${fixture.restaurants.newTalgo}'::uuid`], {
  encoding: "utf8", env: { ...process.env, PGPASSWORD: "postgres" },
});
assert.equal(check.status, 0);
assert.equal(check.stdout.trim(), "1");
process.stdout.write("Reserva de la interfaz persistida en PostgreSQL local; visible en GastroHelp y aislada por RLS.\n");
