import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(await readFile(new URL("../local-schema/supabase-status.json", import.meta.url), "utf8"));
const fixture = JSON.parse(await readFile(new URL("../local-schema/fixture-credentials.json", import.meta.url), "utf8"));
const url = new URL(status.API_URL);
if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54321") {
  throw new Error("LOCAL_SUPABASE_ONLY");
}
const client = (key) => createClient(status.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
const service = client(status.SERVICE_ROLE_KEY);
const talgo = client(status.ANON_KEY);
const other = client(status.ANON_KEY);
const agency = client(status.ANON_KEY);
const restaurantId = fixture.restaurants.newTalgo;
const otherId = fixture.restaurants.mesaNorte;
const publicMenuUrl = new URL(process.env.NEW_TALGO_MENU_TEST_URL || "http://127.0.0.1:4176/api/public/new-talgo/menu");
if (publicMenuUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(publicMenuUrl.hostname)) throw new Error("LOCAL_WEB_ONLY");
async function brandedMenu() {
  const response = await fetch(publicMenuUrl, { cache: "no-store" });
  assert.equal(response.status, 200, "Branded menu endpoint must respond");
  return response.json();
}
const must = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.code || result.error.message}`);
  return result.data;
};
for (const [actor, account] of [
  [talgo, fixture.users.newTalgo],
  [other, fixture.users.mesaNorte],
  [agency, fixture.users.agency],
]) {
  must(await actor.auth.signInWithPassword({ email: account.email, password: account.password }), "LOCAL_AUTH_LOGIN_FAILED");
}

// Only local fixture configuration. The public website remains unindexed and
// names and prices remain unconfirmed; Ángel has authorized his photographs.
must(await service.from("restaurante_modulos").update({ menu_digital: true }).eq("restaurante_id", restaurantId), "LOCAL_MENU_MODULE_SETUP_FAILED");
const enabled = must(await talgo.from("restaurante_modulos").select("menu_digital").eq("restaurante_id", restaurantId).single(), "MENU_MODULE_READ_FAILED");
assert.equal(enabled.menu_digital, true);
const foreignModule = must(await other.from("restaurante_modulos").select("menu_digital").eq("restaurante_id", restaurantId), "FOREIGN_MODULE_READ_FAILED");
assert.equal(foreignModule.length, 0);

let carta = must(await talgo.from("cartas_digitales").select("id,restaurante_id,estado,public_token").eq("restaurante_id", restaurantId).limit(1), "MENU_READ_FAILED")[0];
if (!carta) carta = must(await talgo.from("cartas_digitales").insert({ restaurante_id: restaurantId, nombre: "Carta local pendiente de confirmar", estado: "borrador" }).select("id,restaurante_id,estado,public_token").single(), "LOCAL_DRAFT_MENU_CREATE_FAILED");
assert.equal(carta.restaurante_id, restaurantId);
assert.equal(must(await other.from("cartas_digitales").select("id").eq("id", carta.id), "FOREIGN_MENU_READ_FAILED").length, 0);
if (carta.estado === "borrador") {
  const anonymous = client(status.ANON_KEY);
  assert.equal(must(await anonymous.rpc("obtener_carta_publica", { p_public_token: carta.public_token }), "DRAFT_PUBLIC_RPC_FAILED"), null);
  assert.equal((await brandedMenu()).status, "pendiente");
}
const sandbox = { window: {} };
runInNewContext(await readFile(new URL("../../../../content.js", import.meta.url), "utf8"), sandbox);
const categoryNames = Array.from(sandbox.window.NEW_TALGO_CONTENT.menuCategories);
const existingCategories = must(await talgo.from("carta_categorias").select("id,nombre").eq("carta_id", carta.id), "CATEGORIES_READ_FAILED");
const currentNames = new Set(existingCategories.map((item) => item.nombre));
const missing = categoryNames.filter((name) => !currentNames.has(name));
if (missing.length) must(await talgo.from("carta_categorias").insert(missing.map((nombre, index) => ({ carta_id: carta.id, restaurante_id: restaurantId, nombre, orden: categoryNames.indexOf(nombre) + 1, activa: false }))), "LOCAL_CATEGORIES_CREATE_FAILED");
const categories = must(await talgo.from("carta_categorias").select("id,nombre,activa").eq("carta_id", carta.id), "CATEGORIES_VERIFY_FAILED");
assert.ok(categories.length >= 16, "The confirmed menu may add categories to the original photo preview");
assert.equal(must(await other.from("carta_categorias").select("id").eq("carta_id", carta.id), "FOREIGN_CATEGORIES_READ_FAILED").length, 0);

let productId;
let objectPath;
let temporaryCategoryId;
let originalCategoryActive;
let temporaryPublication = false;
let testCategoryId;
try {
  const testCategory = must(await talgo.from("carta_categorias").insert({
    carta_id: carta.id, restaurante_id: restaurantId, nombre: "Categoría ficticia local", orden: 999, activa: false,
  }).select("id,activa").single(), "ORIGINAL_CATEGORY_CREATE_FAILED");
  testCategoryId = testCategory.id;
  assert.equal(testCategory.activa, false);
  const renamed = must(await talgo.from("carta_categorias").update({ nombre: "Categoría ficticia editada", activa: true })
    .eq("id", testCategoryId).eq("restaurante_id", restaurantId).select("nombre,activa").single(), "ORIGINAL_CATEGORY_EDIT_FAILED");
  assert.equal(renamed.nombre, "Categoría ficticia editada");
  assert.equal(renamed.activa, true);
  assert.equal(must(await other.from("carta_categorias").update({ nombre: "Intrusión" }).eq("id", testCategoryId).select("id"), "FOREIGN_CATEGORY_EDIT_QUERY_FAILED").length, 0);
  const product = must(await talgo.from("carta_productos").insert({
    carta_id: carta.id, restaurante_id: restaurantId, categoria_id: categories[0].id,
    nombre: "Producto ficticio de prueba", descripcion: "Solo para prueba local",
    precio: 1.23, imagen_url: null, tipo: "prueba", alergenos: [],
    recomendado: false, activo: false, orden: 999,
  }).select("id,precio,activo").single(), "ORIGINAL_MENU_PRODUCT_CREATE_FAILED");
  productId = product.id;
  assert.equal(Number(product.precio), 1.23);
  assert.equal(product.activo, false);
  assert.equal(must(await other.from("carta_productos").select("id").eq("id", productId), "FOREIGN_PRODUCT_READ_FAILED").length, 0);
  const foreignUpdate = must(await other.from("carta_productos").update({ precio: 999 }).eq("id", productId).select("id"), "FOREIGN_PRODUCT_UPDATE_QUERY_FAILED");
  assert.equal(foreignUpdate.length, 0);
  const foreignInsert = await other.from("carta_productos").insert({ carta_id: carta.id, restaurante_id: restaurantId, nombre: "Intrusión ficticia", precio: 999, activo: false });
  assert.ok(foreignInsert.error, "Foreign tenant must not insert into New Talgo's menu");
  assert.equal(must(await agency.from("carta_productos").select("id").eq("id", productId), "AGENCY_MENU_READ_FAILED").length, 1);

  const picture = await readFile(new URL("../../../../assets/photos/pizza-carbonara-640.webp", import.meta.url));
  objectPath = `productos/${restaurantId}/${productId}-local-test.webp`;
  const foreignUpload = await other.storage.from("menus").upload(`productos/${restaurantId}/foreign-local-test.webp`, picture, { contentType: "image/webp", upsert: false });
  assert.ok(foreignUpload.error, "Foreign tenant must not upload to New Talgo's photo path");
  must(await talgo.storage.from("menus").upload(objectPath, picture, { contentType: "image/webp", upsert: true }), "ORIGINAL_MENU_PHOTO_UPLOAD_FAILED");
  const photoUrl = talgo.storage.from("menus").getPublicUrl(objectPath).data.publicUrl;
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(photoUrl).hostname));
  const fetched = await fetch(photoUrl);
  assert.equal(fetched.status, 200);
  assert.match(fetched.headers.get("content-type") || "", /image\/webp/);
  must(await talgo.from("carta_productos").update({ precio: 2.34, imagen_url: photoUrl }).eq("id", productId), "ORIGINAL_MENU_PRODUCT_UPDATE_FAILED");
  const saved = must(await service.from("carta_productos").select("precio,imagen_url,activo").eq("id", productId).single(), "MENU_POSTGRES_PERSISTENCE_FAILED");
  assert.equal(Number(saved.precio), 2.34);
  assert.equal(saved.imagen_url, photoUrl);
  assert.equal(saved.activo, false);
  // The same original RPC used by GastroHelp's QR menu must expose only
  // approved active content. Revert the fictitious local publication below.
  temporaryCategoryId = categories[0].id;
  originalCategoryActive = categories[0].activa;
  must(await talgo.from("carta_categorias").update({ activa: true }).eq("id", temporaryCategoryId), "LOCAL_CATEGORY_ACTIVATION_FAILED");
  must(await talgo.from("carta_productos").update({ activo: true }).eq("id", productId), "LOCAL_PRODUCT_ACTIVATION_FAILED");
  must(await service.from("cartas_digitales").update({ estado: "activa" }).eq("id", carta.id), "LOCAL_MENU_ACTIVATION_FAILED");
  temporaryPublication = true;
  const anonymous = client(status.ANON_KEY);
  const publicMenu = must(await anonymous.rpc("obtener_carta_publica", { p_public_token: carta.public_token }), "ORIGINAL_PUBLIC_MENU_RPC_FAILED");
  assert.equal(publicMenu.carta.restaurante_id, restaurantId);
  assert.ok(publicMenu.categorias.some((category) => category.id === temporaryCategoryId));
  const published = publicMenu.productos.find((item) => item.id === productId);
  assert.equal(Number(published?.precio), 2.34);
  assert.equal(published?.imagen_url, photoUrl);
  let branded = await brandedMenu();
  assert.equal(branded.status, "publicada");
  assert.equal(JSON.stringify(branded).includes(carta.public_token), false, "Public response must not include the menu token");
  assert.equal(JSON.stringify(branded).includes(otherId), false, "Public response must not include another restaurant");
  assert.equal(branded.productos.find((item) => item.id === productId)?.precio, 2.34);
  assert.equal(branded.productos.find((item) => item.id === productId)?.imagenUrl, photoUrl);
  must(await talgo.from("carta_productos").update({ precio: 3.45 }).eq("id", productId), "LOCAL_MENU_PRICE_EDIT_FAILED");
  branded = await brandedMenu();
  assert.equal(branded.productos.find((item) => item.id === productId)?.precio, 3.45, "Branded menu must reflect original editor changes after reload");
  must(await talgo.from("carta_productos").update({ activo: false }).eq("id", productId), "LOCAL_MENU_HIDE_FAILED");
  branded = await brandedMenu();
  assert.equal(branded.productos.some((item) => item.id === productId), false, "Hidden product must not appear");
  must(await service.from("carta_productos").update({ precio: null, activo: true }).eq("id", productId), "LOCAL_MENU_NULL_PRICE_CHECK_FAILED");
  branded = await brandedMenu();
  assert.equal(branded.productos.some((item) => item.id === productId), false, "Price-less product must not appear");
  process.stdout.write("Auth local, CRUD original, Storage, RPC pública, carta White Label dinámica, edición, ocultación, precio nulo y RLS: OK.\n");
} finally {
  if (temporaryPublication) must(await service.from("cartas_digitales").update({ estado: carta.estado }).eq("id", carta.id), "LOCAL_MENU_DRAFT_RESTORE_FAILED");
  if (temporaryCategoryId) must(await service.from("carta_categorias").update({ activa: originalCategoryActive }).eq("id", temporaryCategoryId), "LOCAL_CATEGORY_DRAFT_RESTORE_FAILED");
  if (productId) must(await service.from("carta_productos").delete().eq("id", productId), "LOCAL_PRODUCT_CLEANUP_FAILED");
  if (testCategoryId) must(await service.from("carta_categorias").delete().eq("id", testCategoryId), "LOCAL_CATEGORY_CLEANUP_FAILED");
  if (objectPath) must(await service.storage.from("menus").remove([objectPath]), "LOCAL_PHOTO_CLEANUP_FAILED");
}
assert.notEqual(otherId, restaurantId);
if (carta.estado === "borrador") {
  const anonymous = client(status.ANON_KEY);
  assert.equal(must(await anonymous.rpc("obtener_carta_publica", { p_public_token: carta.public_token }), "DRAFT_RESTORE_VERIFY_FAILED"), null);
}
