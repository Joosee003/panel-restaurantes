import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const status = JSON.parse(await readFile("local-schema/supabase-status.json", "utf8"));
const api = new URL(status.API_URL);
if (api.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(api.hostname) || api.port !== "54321") {
  throw new Error("LOCAL_SUPABASE_ONLY");
}
const fixture = JSON.parse(await readFile("local-schema/fixture-credentials.json", "utf8"));
const id = fixture.restaurants?.newTalgo;
if (!/^[0-9a-f-]{36}$/i.test(id || "")) throw new Error("LOCAL_RESTAURANT_REQUIRED");
const psql = "C:\\Users\\Usuario\\Documents\\ChatGPT\\GASTROHELP\\local-only\\pg17\\pgsql\\bin\\psql.exe";
const sql = `
BEGIN;
UPDATE public.restaurantes SET
  direccion='Carr. de Villacastín, 14, 40006 Segovia', telefono='643970267',
  capacidad_total=32, capacidad_comida=32, capacidad_cena=32
WHERE id='${id}' AND slug='new-talgo-local';
UPDATE public.restaurante_webs SET
  direccion_publica='Carr. de Villacastín, 14, 40006 Segovia',
  telefono_publico='643970267', publicada=false
WHERE restaurante_id='${id}';
UPDATE public.reservas_config SET
  capacidad_por_turno=32, personas_minimas=1, personas_maximas=32,
  confirmacion_automatica=true, confirmacion_automatica_hasta=4,
  mesas_activas_en_disponibilidad=true, solicitudes_pendientes_no_ocupan=true,
  requiere_telefono=true, requiere_email=false, zona_horaria='Europe/Madrid'
WHERE restaurante_id='${id}';
UPDATE public.reservas_horarios SET activo=false
WHERE restaurante_id='${id}' AND dia_semana=1;
INSERT INTO public.sala_mesas(restaurante_id,nombre,capacidad,orden,activa,bloqueada)
SELECT '${id}', 'Mesa ' || n, 4, n, true, false FROM generate_series(1,8) n
WHERE NOT EXISTS (SELECT 1 FROM public.sala_mesas WHERE restaurante_id='${id}');
COMMIT;
`;
execFileSync(psql, ["-X", "-h", "127.0.0.1", "-p", "54322", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
  input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, PGPASSWORD: "postgres" },
});
console.log("New Talgo ficticio: dirección confirmada, 8 mesas de 4, 32 plazas y umbral 4 configurados solo en Supabase local. Web pública cerrada.");
