import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

// Transcribed from Ángel's green printed menu, photographed on 2026-10-21.
// Only unambiguous names and prices are published in this LOCAL fixture.
const entries = {
  "Raciones": [
    ["Alitas de pollo al gusto (8)", 8],
    ["Aros de cebolla rebozados (8)", 7],
    ["Bolitas de queso Gouda con sirope de frambuesa (8)", 8],
    ["Calabacín rebozado con queso y jamón (6)", 8],
    ["Calamares a la romana (8)", 8],
    ["Callos a la madrileña", 8],
    ["Caracoles en salsa", 8],
    ["Carne guisada", 8],
    ["Champiñones en salsa", 8],
    ["Chorizo en aceite", 8],
    ["Chorizo frito", 8],
    ["Croquetas de jamón (8)", 8],
    ["Empanadillas caseras de atún o carne (8)", 8],
    ["Huevos con bechamel (8)", 8],
    ["Jamón serrano", 8],
    ["Lomo en aceite", 8],
    ["Morcilla (6)", 8],
    ["Nuggets de pollo con salsa (8)", 8],
    ["Oreja de cerdo en salsa", 8],
    ["Palitos de mozzarella (6)", 8],
    ["Patatas al ajillo", 7],
    ["Patatas alioli", 7],
    ["Patatas bravas", 7],
    ["Patatas con bacón y mozzarella al horno", 8],
    ["Picadillo", 8],
    ["Pinchos morunos", 8],
    ["Queso", 8],
    ["Queso en aceite", 8],
    ["Rollitos de jamón York y queso (6)", 8],
    ["Surtido de embutido", 14],
    ["Tortilla de patata entera", 10],
  ],
  "Sugerencias": [
    ["Gambones a la plancha", 12, "gambones-sugerencia"],
    ["Gambas al ajillo", 12],
    ["Patatas 3 salsas", 3],
    ["Patatas 6 salsas", 5, "tapas"],
    ["Sardinas a la plancha", 8],
    ["Champiñones a la plancha", 8],
    ["Torreznos fritos", 8, "torreznos-sugerencia"],
    ["Paella (mínimo 3 personas; precio por persona)", 10, "sugerencias"],
  ],
  "Hamburguesas": [
    ["Hamburguesa nº 1 — pan y carne con salsas", 3.5],
    ["Hamburguesa nº 2 — carne, lechuga, tomate y cebolla con salsas", 4.5],
    ["Hamburguesa nº 3 — carne, queso y bacón con salsa", 5],
    ["Hamburguesa nº 4 — carne, lechuga, cebolla, tomate, queso, bacón, huevo y jamón", 8, "hamburguesas"],
    ["Hamburguesa nº 5 — pulled pork, bacón y queso cheddar", 8],
    ["Hamburguesa nº 6 — pollo empanado, mayonesa, tomate y lechuga", 8],
  ],
  "Platos combinados": [
    ["Plato nº 1 — 2 huevos, lomo y patatas", 8, "platosCombinados"],
    ["Plato nº 2 — 2 huevos, hamburguesas, patatas, lechuga y tomate", 9],
    ["Plato nº 3 — 2 huevos, salchichas y patatas", 8],
    ["Plato nº 4 — calamares, croquetas y ensalada", 8],
    ["Plato nº 5 — 2 huevos, San Jacobos y patatas", 8],
    ["Plato nº 6 — 2 huevos, alitas de pollo y patatas", 8, "combinado-6"],
    ["Plato nº 7 — 2 huevos, croquetas, bacón y patatas", 8, "combinado-7"],
    ["Plato nº 8 — 2 huevos, chorizo frito y patatas", 8],
    ["Plato nº 9 — merluza rebozada con ensalada", 8],
    ["Plato nº 10 — tortilla francesa al gusto con ensalada", 8],
    ["Plato nº 11 — pechuga de pollo rebozada con ensalada", 9],
    ["Plato nº 12 — panga rebozada con ensalada", 9],
    ["Plato nº 13 — cachopo de jamón serrano, queso azul y patatas", 16],
    ["Plato nº 14 — ternera con huevo y patatas", 10],
    ["Plato nº 15 — cordón bleu con huevo y patatas", 12],
  ],
  "Sándwiches": [
    ["Sándwich nº 1 — jamón York y queso", 3.5],
    ["Sándwich nº 2 — jamón York, queso y huevo a la plancha", 4],
    ["Sándwich nº 3 — jamón York, queso, tomate, huevo duro y cebolla", 5],
    ["Sándwich nº 4 — tortilla francesa al gusto, queso y jamón serrano", 6],
    ["Sándwich nº 5 — queso trufado, jamón serrano y cebolla caramelizada", 8],
  ],
  "Ensaladas": [
    ["Ensalada nº 2 — lechuga, tomate, cebolla, atún y huevo duro", 8],
    ["Ensalada nº 3 — lechuga, tomate, cebolla, atún, queso brie, jamón York y cebolla frita", 10],
  ],
  "Mini salaitos": [
    ["Mini salaitos de sobrasada (8)", 6],
    ["Mini salaitos de paté y bacón (8)", 6],
    ["Mini salaitos de queso azul (8)", 6],
    ["Mini salaitos de rulo de cabra y cebolla caramelizada (8)", 6],
    ["Mini salaitos de bacón y queso Gouda (8)", 6],
  ],
  "Huevos rotos": [
    ["Huevos rotos con picadillo", 8],
    ["Huevos rotos con chorizo", 8, "huevos-rotos-chorizo"],
    ["Huevos rotos con jamón serrano y bacón", 8, "huevosRotos"],
    ["Huevos rotos con jamón York y queso brie", 8],
    ["Huevos rotos con atún y pimientos del piquillo", 8],
  ],
  "Revueltos": [
    ["Revuelto de gulas", 8],
    ["Revuelto de morcilla", 8],
    ["Revuelto de ajetes", 8],
    ["Revuelto de setas", 8, "revuelto-setas"],
    ["Revuelto de queso y jamón York", 8],
    ["Revuelto de migas de atún y tomate", 8, "revueltos"],
  ],
  "Tosta pizzas": [
    ["Tosta pizza nº 1 — pollo y bacón", 8],
    ["Tosta pizza nº 2 — Frankfurt y pollo", 8],
    ["Tosta pizza nº 3 — tres quesos", 8],
    ["Tosta pizza nº 4 — kebab", 8],
    ["Tosta pizza nº 5 — rulo de cabra", 8],
    ["Tosta pizza nº 6 — mexicana", 8, "tostas"],
  ],
  "Pizzas": [
    ["Pizza cuatro quesos", 9, "pizza-gourmet-cuatro-quesos"],
    ["Pizza barbacoa", 9, "pizza-barbacoa"],
    ["Pizza carbonara", 9, "pizzas"],
    ["Pizza jamón serrano", 9],
    ["Pizza pepperoni", 9, "hero"],
    ["Pizza de pollo", 9, "pizza-pollo"],
    ["Pizza de atún y bacón", 9],
    ["Pizza jamón York y queso", 9],
    ["Pizza pulled pork", 9, "pizza-pulled-pork"],
    ["Pizza hawaiana", 9],
    ["Pizza boloñesa", 9],
    ["Pizza mozzarella", 9],
    ["Pizza vegetal", 9],
  ],
  "Tostas": [
    ["Tosta de jamón serrano en tumaca (2 unidades)", 6],
    ["Tosta de jamón York y queso brie (2 unidades)", 6],
    ["Tosta de jamón ahumado y mantequilla (2 unidades)", 6],
    ["Tosta de chorizo frito y queso fundido (2 unidades)", 6],
    ["Tosta de paté con bacón (2 unidades)", 6],
    ["Tosta de migas de bonito con pimiento rojo (2 unidades)", 6],
    ["Tosta de sobrasada con mozzarella (2 unidades)", 6],
  ],
  "Empanadas caseras": [
    ["Empanada de atún y pimiento rojo de piquillo", 10],
    ["Empanada de carne picada", 10],
    ["Empanada de morcilla y queso azul", 10],
    ["Empanada de bacón y queso Gouda", 10],
    ["Empanada de jamón serrano y queso de cabra", 10],
    ["Empanada de pollo y queso cheddar", 10],
  ],
  "Paninis": [
    ["Panini de atún y pimiento rojo de piquillo", 4],
    ["Panini de jamón York y mozzarella", 4, "panini-2"],
    ["Panini de sobrasada y cuatro quesos", 4],
    ["Panini de paté de cerdo y bacón", 4],
    ["Panini de salami, queso de cabra y cebolla caramelizada", 4, "paninis"],
  ],
  "Bocadillos": [
    ["Bocadillo de tortilla de patatas", 5], ["Medio bocadillo de tortilla de patatas", 3],
    ["Bocadillo de tortilla al gusto", 5], ["Medio bocadillo de tortilla al gusto", 3],
    ["Bocadillo de jamón serrano", 5, "bocadillos"], ["Medio bocadillo de jamón serrano", 3],
    ["Bocadillo de chorizo frito", 5], ["Medio bocadillo de chorizo frito", 3],
    ["Bocadillo de bacón", 5, "bocadillo-bacon"], ["Medio bocadillo de bacón", 3],
    ["Bocadillo de lomo a la plancha", 6], ["Medio bocadillo de lomo a la plancha", 3.5],
    ["Bocadillo de calamares a la romana", 6], ["Medio bocadillo de calamares a la romana", 3.5],
    ["Bocadillo de salchichón", 5], ["Medio bocadillo de salchichón", 3],
    ["Bocadillo de chorizo Pamplona", 5], ["Medio bocadillo de chorizo Pamplona", 3],
    ["Bocadillo de queso", 6], ["Medio bocadillo de queso", 3.5],
    ["Bocadillo de pollo empanado", 5, "bocadillo-pollo"], ["Medio bocadillo de pollo empanado", 3],
    ["Pepito de ternera", 7],
    ["Bocadillo de salchichas", 5], ["Medio bocadillo de salchichas", 3.5],
  ],
  "Perritos": [
    ["Perrito nº 1 — salchicha, patatas y salsas", 3],
    ["Perrito nº 2 — salchicha, queso fundido, patatas y salsas", 4],
    ["Perrito nº 3 — salchicha, queso, bacón, cebolla frita, patatas y salsas", 5],
    ["Perrito nº 4 — salchicha, bacón y mozzarella", 5],
  ],
  "Bebidas": [
    ["Agua 50 cl", 1.5], ["Agua 1,5 l", 2.5], ["Refresco de lata", 2],
    ["Cerveza en lata", 2], ["Aquarade o Lipton", 2.5], ["Zumo de frutas", 2.5],
  ],
  "Postres": [
    ["Helado (cono o bombón)", 2], ["Flan", 2], ["Natillas", 2],
    ["Arroz con leche", 2.5], ["Tarta del día", 5], ["Vaso de dos chocolates y Oreo", 5],
  ],
};

const status = JSON.parse(await readFile(new URL("../local-schema/supabase-status.json", import.meta.url), "utf8"));
const fixture = JSON.parse(await readFile(new URL("../local-schema/fixture-credentials.json", import.meta.url), "utf8"));
const api = new URL(status.API_URL);
assert.equal(api.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(api.hostname));
assert.equal(api.port, "54321");
const client = (key) => createClient(status.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
const owner = client(status.ANON_KEY);
const admin = client(status.SERVICE_ROLE_KEY);
const restaurantId = fixture.restaurants.newTalgo;
const { error: loginError } = await owner.auth.signInWithPassword(fixture.users.newTalgo);
if (loginError) throw loginError;
function must(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code || result.error.message}`);
  return result.data;
}
must(await admin.from("restaurantes").update({ telefono: "643970267", capacidad_total: 32 })
  .eq("id", restaurantId), "RESTAURANT_CONFIRMED_DATA");
let menu = must(await owner.from("cartas_digitales").select("id,estado").eq("restaurante_id", restaurantId).limit(1), "MENU_LOOKUP")[0];
if (!menu) menu = must(await owner.from("cartas_digitales").insert({
  restaurante_id: restaurantId, nombre: "Carta New Talgo — octubre 2026", estado: "borrador",
}).select("id,estado").single(), "MENU_CREATE");
const existingCategories = must(await owner.from("carta_categorias").select("id,nombre").eq("carta_id", menu.id), "CATEGORY_LOOKUP");
const categoryByName = new Map(existingCategories.map((row) => [row.nombre, row.id]));
const existingProducts = must(await owner.from("carta_productos").select("id,categoria_id,nombre").eq("carta_id", menu.id), "PRODUCT_LOOKUP");
const productNames = new Set(existingProducts.map((row) => `${row.categoria_id}:${row.nombre}`));
const sandbox = { window: {} };
const { runInNewContext } = await import("node:vm");
runInNewContext(await readFile(new URL("../public/new-talgo/content.js", import.meta.url), "utf8"), sandbox);
const photos = sandbox.window.NEW_TALGO_CONTENT.photos;
let inserted = 0;
let photographed = 0;
for (const [categoryName, products] of Object.entries(entries)) {
  let categoryId = categoryByName.get(categoryName);
  if (!categoryId) {
    const category = must(await owner.from("carta_categorias").insert({
      carta_id: menu.id, restaurante_id: restaurantId, nombre: categoryName,
      orden: Object.keys(entries).indexOf(categoryName) + 1, activa: true,
    }).select("id").single(), "CATEGORY_CREATE");
    categoryId = category.id;
    categoryByName.set(categoryName, categoryId);
  } else {
    must(await owner.from("carta_categorias").update({ activa: true }).eq("id", categoryId), "CATEGORY_ACTIVATE");
  }
  for (const [name, price, photoKey] of products) {
    if (productNames.has(`${categoryId}:${name}`)) continue;
    assert.ok(Number.isFinite(price) && price > 0);
    const product = must(await owner.from("carta_productos").insert({
      carta_id: menu.id, restaurante_id: restaurantId, categoria_id: categoryId,
      nombre: name, precio: price, descripcion: null, alergenos: [], recomendado: false,
      activo: true, tipo: "plato", orden: products.findIndex((item) => item[0] === name) + 1,
    }).select("id").single(), "PRODUCT_CREATE");
    productNames.add(`${categoryId}:${name}`);
    inserted++;
    if (photoKey && photos[photoKey]?.small) {
      const filename = photos[photoKey].small.split("/").at(-1);
      const image = await readFile(new URL(`../public/new-talgo/assets/photos/${filename}`, import.meta.url));
      const objectPath = `productos/${restaurantId}/${product.id}.webp`;
      must(await owner.storage.from("menus").upload(objectPath, image, {
        contentType: "image/webp", upsert: true,
      }), "PHOTO_UPLOAD");
      const publicUrl = owner.storage.from("menus").getPublicUrl(objectPath).data.publicUrl;
      must(await owner.from("carta_productos").update({ imagen_url: publicUrl }).eq("id", product.id), "PHOTO_ASSOCIATE");
      photographed++;
    }
  }
}
must(await admin.from("restaurante_modulos").update({ menu_digital: true }).eq("restaurante_id", restaurantId), "MENU_MODULE");
const published = must(await admin.from("cartas_digitales").update({
  nombre: "Carta New Talgo — octubre 2026", estado: "activa",
}).eq("id", menu.id).select("id,estado").single(), "MENU_PUBLISH_LOCAL");
assert.equal(published.estado, "activa");
process.stdout.write(`Carta verde importada en Supabase LOCAL: ${inserted} productos nuevos, ${photographed} fotografías enlazadas, ${Object.keys(entries).length} categorías.\n`);
