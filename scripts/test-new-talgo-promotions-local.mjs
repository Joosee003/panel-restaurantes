import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(await readFile(new URL("../local-schema/supabase-status.json", import.meta.url), "utf8"));
const fixture = JSON.parse(await readFile(new URL("../local-schema/fixture-credentials.json", import.meta.url), "utf8"));
const origin = new URL(status.API_URL);
if (origin.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(origin.hostname) || origin.port !== "54321") throw new Error("LOCAL_SUPABASE_ONLY");
const site = "http://127.0.0.1:4176";
const api = `${site}/api/public/new-talgo/promotions`;
const make = key => createClient(status.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
const owner = make(status.ANON_KEY);
const other = make(status.ANON_KEY);
const agency = make(status.ANON_KEY);
const anon = make(status.ANON_KEY);
const service = make(status.SERVICE_ROLE_KEY);
const rid = fixture.restaurants.newTalgo;
const otherId = fixture.restaurants.mesaNorte;
const must = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.code || result.error.message}`); return result.data; };
for (const [client, account] of [[owner, fixture.users.newTalgo], [other, fixture.users.mesaNorte], [agency, fixture.users.agency]]) {
  must(await client.auth.signInWithPassword({ email: account.email, password: account.password }), "LOCAL_AUTH_FAILED");
}
const ids = [];
let storagePath;
let productId;
const publicRows = async () => must(await anon.rpc("obtener_promociones_publicas", { p_restaurante_id: rid }), "PUBLIC_RPC_FAILED");
const branded = async () => {
  const response = await fetch(api, { cache: "no-store" });
  assert.equal(response.status, 200, "Branded endpoint must answer");
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  return (await response.json()).promociones;
};
const madrid = () => Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
}).formatToParts(new Date()).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
const shift = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

try {
  const base = { restaurante_id: rid, ubicacion: "estacion", tipo: "pack", titulo: "Pack ficticio de verificación local",
    descripcion: "Prueba automatizada local, sin oferta real.", precio: 4.56, condiciones: "Solo verificación local.",
    imagen_url: "/new-talgo/assets/photos/pizza-barbacoa.webp", cta_texto: "Ver carta", cta_destino: "carta" };
  const draft = must(await owner.from("promociones").insert(base).select("*").single(), "CREATE_DRAFT_FAILED");
  ids.push(draft.id);
  assert.equal(draft.estado, "borrador");
  assert.equal(must(await other.from("promociones").select("id").eq("id", draft.id), "FOREIGN_READ_FAILED").length, 0);
  assert.equal(must(await agency.from("promociones").select("id").eq("id", draft.id), "AGENCY_READ_FAILED").length, 1);
  assert.equal(must(await agency.from("promociones").update({ publico: "Supervisión ficticia" }).eq("id", draft.id).select("id"), "AGENCY_WRITE_FAILED").length, 1);
  assert.ok((await anon.from("promociones").insert(base)).error, "Anonymous writes must fail");
  assert.equal(must(await other.from("promociones").update({ titulo: "Intrusión" }).eq("id", draft.id).select("id"), "FOREIGN_UPDATE_FAILED").length, 0);
  assert.ok((await other.from("promociones").insert({ ...base, titulo: "Intrusión", restaurante_id: rid })).error, "Foreign owner must not insert");
  assert.equal(must(await anon.from("promociones").select("id").eq("id", draft.id), "ANON_DRAFT_READ_FAILED").length, 0);
  assert.equal((await publicRows()).some(row => row.id === draft.id), false);
  assert.equal((await branded()).some(row => row.id === draft.id), false);

  const carta = must(await owner.from("cartas_digitales").select("id").eq("restaurante_id", rid).limit(1), "LOCAL_CARTA_READ_FAILED")[0];
  assert.ok(carta?.id, "Local original menu must exist");
  const product = must(await owner.from("carta_productos").insert({ carta_id: carta.id, restaurante_id: rid,
    nombre: "Producto ficticio vinculado", precio: 1.01, activo: false, tipo: "prueba", alergenos: [], orden: 999,
  }).select("id").single(), "PROMOTION_PRODUCT_CREATE_FAILED");
  productId = product.id;
  const linked = must(await owner.from("promociones").insert({ ...base, titulo: "Pack con producto ficticio", producto_ids: [productId],
    productos_texto: "Producto ficticio vinculado" }).select("id,producto_ids").single(), "SAME_TENANT_PRODUCT_LINK_FAILED");
  ids.push(linked.id);
  assert.deepEqual(linked.producto_ids, [productId]);

  assert.ok((await owner.from("promociones").update({ estado: "activa", precio: 0 }).eq("id", draft.id)).error, "Invalid price must fail");
  must(await owner.from("promociones").update({ estado: "activa" }).eq("id", draft.id), "ACTIVATE_FAILED");
  assert.equal((await publicRows()).some(row => row.id === draft.id), true);
  let card = (await branded()).find(row => row.id === draft.id);
  assert.equal(card.precio, 4.56);
  assert.equal(card.ubicacion, "estacion");
  assert.equal(card.imagenUrl, base.imagen_url);
  assert.equal((await fetch(`${site}${card.imagenUrl}`)).status, 200);

  must(await owner.from("promociones").update({ precio: 5.67, imagen_url: "/new-talgo/assets/photos/pizza-pollo.webp" }).eq("id", draft.id), "EDIT_FAILED");
  card = (await branded()).find(row => row.id === draft.id);
  assert.equal(card.precio, 5.67);
  assert.equal(card.imagenUrl, "/new-talgo/assets/photos/pizza-pollo.webp");

  const picture = await readFile(new URL("../public/new-talgo/assets/photos/pizza-pollo-640.webp", import.meta.url));
  storagePath = `productos/${rid}/promo-${draft.id}-local-test.webp`;
  assert.ok((await other.storage.from("menus").upload(`productos/${rid}/promo-intrusion-test.webp`, picture, { contentType: "image/webp", upsert: false })).error, "Foreign photo upload must fail");
  must(await owner.storage.from("menus").upload(storagePath, picture, { contentType: "image/webp", upsert: false }), "PHOTO_UPLOAD_FAILED");
  const storedPhoto = owner.storage.from("menus").getPublicUrl(storagePath).data.publicUrl;
  must(await owner.from("promociones").update({ imagen_url: storedPhoto }).eq("id", draft.id), "PHOTO_REPLACE_FAILED");
  assert.equal((await branded()).find(row => row.id === draft.id).imagenUrl, storedPhoto);
  assert.equal((await fetch(storedPhoto)).status, 200);
  must(await owner.from("promociones").update({ imagen_url: `${status.API_URL}/storage/v1/object/public/menus/productos/${otherId}/another.webp` }).eq("id", draft.id), "FOREIGN_PHOTO_REFERENCE_WRITE_FAILED");
  assert.equal((await branded()).find(row => row.id === draft.id).imagenUrl, null, "Foreign restaurant photo URL must be omitted");
  must(await owner.from("promociones").update({ imagen_url: storedPhoto }).eq("id", draft.id), "PHOTO_RESTORE_FAILED");

  const clock = madrid();
  const today = `${clock.year}-${clock.month}-${clock.day}`;
  must(await owner.from("promociones").update({ estado: "programada", fecha_inicio: shift(today, 1) }).eq("id", draft.id), "SCHEDULE_FAILED");
  assert.equal((await branded()).some(row => row.id === draft.id), false, "Future promotion must stay hidden");
  must(await owner.from("promociones").update({ estado: "activa", fecha_inicio: shift(today, -3), fecha_fin: shift(today, -1) }).eq("id", draft.id), "EXPIRE_FAILED");
  assert.equal((await branded()).some(row => row.id === draft.id), false, "Expired promotion must stay hidden");
  const weekday = ((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  must(await owner.from("promociones").update({ fecha_fin: null, dias_semana: [(weekday % 7) + 1] }).eq("id", draft.id), "WEEKDAY_FAILED");
  assert.equal((await branded()).some(row => row.id === draft.id), false, "Wrong weekday must stay hidden");
  const outside = Number(clock.hour) < 12 ? ["18:00", "19:00"] : ["08:00", "09:00"];
  must(await owner.from("promociones").update({ dias_semana: [], hora_inicio: outside[0], hora_fin: outside[1] }).eq("id", draft.id), "HOURS_FAILED");
  assert.equal((await branded()).some(row => row.id === draft.id), false, "Outside hours must stay hidden");
  must(await owner.from("promociones").update({ hora_inicio: null, hora_fin: null }).eq("id", draft.id), "HOURS_RESET_FAILED");
  assert.equal((await branded()).some(row => row.id === draft.id), true);

  const event = must(await owner.from("promociones").insert({ restaurante_id: rid, ubicacion: "partidas", tipo: "evento", titulo: "Actividad ficticia local",
    descripcion: "Actividad solo para validar la ubicación.", imagen_url: "/new-talgo/assets/photos/tapas-patatas.webp", estado: "activa" }).select("id").single(), "EVENT_CREATE_FAILED");
  ids.push(event.id);
  assert.equal((await branded()).find(row => row.id === event.id)?.precio, null);
  assert.equal((await branded()).find(row => row.id === event.id)?.ubicacion, "partidas");

  const models = [
    { tipo: "precio_especial", precio: 1.11 }, { tipo: "porcentaje", descuento_porcentaje: 10 },
    { tipo: "descuento_fijo", descuento_eur: 1 }, { tipo: "grupos", personas_minimas: 4 }, { tipo: "dos_por_uno" },
  ];
  for (const model of models) {
    const row = must(await owner.from("promociones").insert({ restaurante_id: rid, ubicacion: "universitarios", titulo: `Modelo ficticio ${model.tipo}`,
      descripcion: "Solo prueba local", ...model }).select("id,estado").single(), `MODEL_${model.tipo}_FAILED`);
    ids.push(row.id);
    assert.equal(row.estado, "borrador");
  }
  assert.ok((await owner.from("promociones").insert({ ...base, tipo: "porcentaje", precio: null, descuento_porcentaje: 101 })).error, "Discount over 100 must fail");
  assert.ok((await owner.from("promociones").insert({ ...base, estado: "programada" })).error, "Scheduled promotion needs a date");
  assert.ok((await owner.from("promociones").insert({ ...base, producto_ids: ["11111111-1111-4111-8111-111111111111"] })).error, "Unknown product must fail");

  must(await owner.from("promociones").update({ estado: "pausada" }).eq("id", draft.id), "PAUSE_FAILED");
  assert.equal((await branded()).some(row => row.id === draft.id), false, "Paused promotion must disappear");
  assert.notEqual(rid, otherId);
  process.stdout.write("Promociones locales: Auth, borrador, 7 modelos, activación, web, precio, Storage, horario Madrid, caducidad, pausa, agencia y RLS: OK.\n");
} finally {
  if (ids.length) must(await service.from("promociones").delete().in("id", ids), "LOCAL_PROMOTION_CLEANUP_FAILED");
  if (productId) must(await service.from("carta_productos").delete().eq("id", productId), "LOCAL_PRODUCT_CLEANUP_FAILED");
  if (storagePath) must(await owner.storage.from("menus").remove([storagePath]), "LOCAL_PHOTO_CLEANUP_FAILED");
}
