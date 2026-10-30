import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

class Element {
  constructor(tag = "div") { this.tag = tag; this.children = []; this.hidden = false; this.className = ""; this.textContent = ""; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener() {}
  remove() {}
}

const walk = (node) => [node, ...node.children.flatMap(walk)];
const flush = () => new Promise(resolve => setImmediate(resolve));

test("live promotions appear only for API offers and disappear without leaving an empty section", async () => {
  const home = readFileSync(join(process.cwd(), "public/new-talgo/index.html"), "utf8");
  assert.match(home, /data-promo-section hidden/);
  assert.match(home, /src="promotions-live\.js"/);

  const section = new Element("section"); section.hidden = true;
  const grid = new Element("div");
  const nav = [new Element("a"), new Element("a")];
  nav.forEach(link => { link.hidden = true; });
  let offers = [];
  let refresh;
  let fail = false;
  const document = {
    hidden: false,
    querySelector: selector => selector === "[data-promo-section]" ? section : selector === "[data-promo-grid]" ? grid : null,
    querySelectorAll: () => nav,
    createElement: tag => new Element(tag),
    addEventListener() {},
  };
  const sandbox = {
    document,
    window: { setInterval: callback => { refresh = callback; } },
    fetch: async () => fail ? { ok: false } : { ok: true, json: async () => ({ promociones: offers }) },
    Intl,
    Error,
  };
  runInNewContext(readFileSync(join(process.cwd(), "public/new-talgo/promotions-live.js"), "utf8"), sandbox);
  await flush();
  assert.equal(section.hidden, true);
  assert.equal(grid.children.length, 0);
  assert.ok(nav.every(link => link.hidden));

  offers = [{ id: "qa-only", ubicacion: "estacion", tipo: "porcentaje", titulo: "Oferta de prueba", descripcion: "Descripción de prueba", imagenUrl: "/new-talgo/assets/photos/fachada-real-640.webp", descuentoPorcentaje: 12, condiciones: "Condiciones de prueba", boton: "Ver carta", destino: "carta" }];
  refresh();
  await flush();
  assert.equal(section.hidden, false);
  assert.ok(nav.every(link => !link.hidden));
  const nodes = walk(grid);
  assert.equal(nodes.find(node => node.tag === "h3")?.textContent, "Oferta de prueba");
  assert.equal(nodes.find(node => node.tag === "img")?.src, offers[0].imagenUrl);
  assert.ok(nodes.some(node => node.textContent === "−12 %"));
  assert.ok(nodes.some(node => node.textContent === "Condiciones de prueba"));
  assert.equal(nodes.find(node => node.tag === "a")?.href, "carta.html");

  offers = [];
  refresh();
  await flush();
  assert.equal(section.hidden, true);
  assert.equal(grid.children.length, 0);
  assert.ok(nav.every(link => link.hidden));

  fail = true;
  refresh();
  await flush();
  assert.equal(section.hidden, true);
});
