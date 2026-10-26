import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

const root = join(process.cwd(), "public", "new-talgo");
const pages = ["index.html", "carta.html", "visitanos.html"];

test("staged New Talgo web has valid local navigation and stays unindexed pending Ángel's data", () => {
  for (const page of pages) {
    const html = readFileSync(join(root, page), "utf8");
    assert.match(html, /<html lang="es">/);
    assert.match(html, /<meta name="viewport"/);
    assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<h1\b/);
    assert.match(html, /href="#main"/);
    assert.match(html, /<main\b[^>]*id="main"/);
    for (const [, href] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (href.startsWith("#") || /^(https?:|tel:|mailto:)/.test(href)) continue;
      if (href === "/new-talgo/reservar") {
        assert.ok(existsSync(join(process.cwd(), "app", "new-talgo", "reservar", "page.tsx")));
        continue;
      }
      assert.ok(existsSync(join(root, href.split("#")[0])), `${page}: missing ${href}`);
    }
  }
});

test("confirmed details, disabled services and real photos are represented accurately", () => {
  const sandbox = { window: {} };
  runInNewContext(readFileSync(join(root, "content.js"), "utf8"), sandbox);
  const content = sandbox.window.NEW_TALGO_CONTENT;
  assert.equal(content.phoneConfirmed, true);
  assert.equal(content.phone.replace(/\D/g, ""), "643970267");
  assert.equal(content.openingHoursConfirmed, true);
  assert.match(content.openingHours, /martes a domingo, 11:30–23:30/i);
  assert.equal(content.totalTables, 8);
  assert.equal(content.totalSeats, 32);
  assert.equal(content.pickupConfirmed, false);
  assert.equal(content.menuConfirmed, true);
  assert.equal(content.photoRightsConfirmed, true);
  assert.equal(content.photos.facade, null);
  for (const [key, photo] of Object.entries(content.photos)) {
    if (key === "facade") continue;
    assert.ok(photo, `${key}: missing photo`);
    for (const filename of [photo.src, photo.small]) {
      assert.match(filename, /^assets\/photos\/[a-z0-9._-]+\.webp$/);
      assert.ok(existsSync(join(root, filename)), `${key}: missing ${filename}`);
    }
    assert.ok(photo.alt.length > 12, `${key}: missing descriptive alt text`);
    assert.ok(photo.width > photo.smallWidth && photo.height > 0);
  }
  const uniquePhotos = new Set(Object.values(content.photos).filter(Boolean).map(photo => photo.src));
  assert.equal(uniquePhotos.size, 39);
  const carta = readFileSync(join(process.cwd(), "..", "..", "..", "carta.html"), "utf8");
  const categories = [...carta.matchAll(/<article class="menu-v2-row" id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(categories.length, 16);
  for (const category of categories) {
    assert.match(carta, new RegExp(`<a href="#${category}">`));
  }
  for (const [category, keys] of Object.entries(content.gallery)) {
    assert.ok(categories.includes(category), `${category}: missing category`);
    for (const key of keys) assert.ok(content.photos[key], `${category}: missing ${key}`);
  }
  const servedMenu = readFileSync(join(root, "carta.html"), "utf8");
  assert.match(servedMenu, /src="menu-live\.js"/);
  assert.match(servedMenu, /id="live-menu-list"/);
  assert.doesNotMatch(servedMenu, /<article class="menu-v2-row"/);
  assert.doesNotMatch(servedMenu, /Carta por confirmar/);
  assert.doesNotMatch(readFileSync(join(root, "index.html"), "utf8"), /href="carta\.html#/);
  assert.match(readFileSync(join(root, "index.html"), "utf8"), /Fotografías reales enviadas por Ángel/);
  assert.doesNotMatch(readFileSync(join(root, "index.html"), "utf8"), /derechos de uso pendientes de confirmar/i);
  assert.match(readFileSync(join(root, "index.html"), "utf8"), /href="carta.html"/);
  assert.match(readFileSync(join(root, "index.html"), "utf8"), /href="visitanos.html"/);
  const home = readFileSync(join(root, "index.html"), "utf8");
  assert.match(home, /href="\/new-talgo\/reservar"/);
  assert.match(home, /Reservas online en preparación/);
  assert.match(home, /data-gallery-next/);
  assert.doesNotMatch(home, /data-promo-slot|dos por uno|descuento activo/i);
});
