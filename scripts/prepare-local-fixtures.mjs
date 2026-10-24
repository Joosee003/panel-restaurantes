import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = join(process.cwd(), "local-schema");
const status = JSON.parse(await readFile(join(root, "supabase-status.json"), "utf8"));
const url = new URL(status.API_URL);
if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54321") {
  throw new Error("LOCAL_SUPABASE_ONLY");
}
try {
  await stat(join(root, "fixture-credentials.json"));
  throw new Error("LOCAL_FIXTURE_ALREADY_EXISTS");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const psql = "C:\\Users\\Usuario\\Documents\\ChatGPT\\GASTROHELP\\local-only\\pg17\\pgsql\\bin\\psql.exe";
function localSql(sql) {
  return execFileSync(psql, ["-X", "-h", "127.0.0.1", "-p", "54322", "-U", "supabase_admin", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PGPASSWORD: "postgres", PGOPTIONS: "-c client_min_messages=error" },
  });
}
const actors = [
  { key: "newTalgo", email: "new-talgo-local@example.invalid" },
  { key: "mesaNorte", email: "mesa-norte-local@example.invalid" },
  { key: "agency", email: "agencia-local@example.invalid" },
];
const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) throw new Error("LOCAL_AUTH_LIST_FAILED");
for (const existing of listed.data.users) {
  if (!actors.some((actor) => actor.email === existing.email)) continue;
  const removed = await admin.auth.admin.deleteUser(existing.id);
  if (removed.error) throw new Error("LOCAL_FIXTURE_USER_CLEANUP_FAILED");
}
const users = {};
// Production requires an invitation for new accounts. These are isolated test
// identities; bypass onboarding only while creating them, then restore it.
localSql("ALTER TABLE auth.users DISABLE TRIGGER procesar_usuario_invitado;");
try {
  for (const actor of actors) {
    const password = randomBytes(18).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({
      email: actor.email, password, email_confirm: true,
    });
    if (error || !data.user?.id) throw new Error(`LOCAL_AUTH_CREATE_FAILED_${actor.key}: ${error?.message || "missing user"}`);
    users[actor.key] = { id: data.user.id, email: actor.email, password };
  }
} finally {
  localSql("ALTER TABLE auth.users ENABLE TRIGGER procesar_usuario_invitado;");
}
const restaurants = { newTalgo: randomUUID(), mesaNorte: randomUUID() };
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sql = `
BEGIN;
INSERT INTO public.restaurantes(id,nombre,slug,owner_id,color_primario,color_fondo,horario_cena)
VALUES
  (${q(restaurants.newTalgo)},'New Talgo local ficticio','new-talgo-local',${q(users.newTalgo.id)},'#263a35','#f5f0e7','19:30-23:00'),
  (${q(restaurants.mesaNorte)},'Mesa Norte local ficticio','mesa-norte-local',${q(users.mesaNorte.id)},'#263a35','#f5f0e7','19:30-23:00');
INSERT INTO public.usuarios_restaurantes(user_id,restaurante_id)
VALUES (${q(users.newTalgo.id)},${q(restaurants.newTalgo)}),
       (${q(users.mesaNorte.id)},${q(restaurants.mesaNorte)});
INSERT INTO public.app_admins(user_id) VALUES (${q(users.agency.id)});
INSERT INTO public.restaurante_modulos(restaurante_id,reservas,clientes,estado)
VALUES (${q(restaurants.newTalgo)},true,true,'activo'),
       (${q(restaurants.mesaNorte)},true,true,'activo')
ON CONFLICT (restaurante_id) DO UPDATE SET reservas=true,clientes=true,estado='activo';
INSERT INTO public.reservas_config(restaurante_id,activo,zona_horaria,intervalo_minutos,duracion_minutos,
  capacidad_por_turno,personas_minimas,personas_maximas,antelacion_minutos,dias_maximos_antelacion,
  confirmacion_automatica,requiere_telefono,requiere_email)
VALUES
  (${q(restaurants.newTalgo)},true,'Europe/Madrid',30,60,1,1,8,0,30,true,false,false),
  (${q(restaurants.mesaNorte)},true,'Europe/Madrid',30,60,1,1,8,0,30,true,false,false)
ON CONFLICT (restaurante_id) DO UPDATE SET activo=true,capacidad_por_turno=1,
  antelacion_minutos=0,requiere_telefono=false,requiere_email=false;
UPDATE public.reservas_horarios SET activo=true
WHERE restaurante_id IN (${q(restaurants.newTalgo)},${q(restaurants.mesaNorte)})
  AND turno='cena';
COMMIT;
`;
localSql(sql);
await writeFile(join(root, "fixture-credentials.json"), JSON.stringify({ users, restaurants }, null, 2));
process.stdout.write("Tres usuarios Auth y dos restaurantes ficticios preparados en Supabase local.\n");
