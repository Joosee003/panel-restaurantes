import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { newTalgoPublicRobots } from "../app/lib/newTalgoRobots.ts";

test("approved New Talgo build prepares canonical, social metadata and Restaurant schema on the final host", () => {
  const root = mkdtempSync(join(tmpdir(), "new-talgo-seo-"));
  const source = join(process.cwd(), "public", "new-talgo");
  try {
    cpSync(join(process.cwd(), "scripts", "prepare-new-talgo-publication.mjs"), join(root, "scripts", "prepare-new-talgo-publication.mjs"), { recursive: true, force: true });
    for (const page of ["index.html", "carta.html", "visitanos.html", "content.js"]) {
      cpSync(join(source, page), join(root, "public", "new-talgo", page), { recursive: true, force: true });
    }
    const contentPath = join(root, "public", "new-talgo", "content.js");
    writeFileSync(contentPath, readFileSync(contentPath, "utf8").replace("legalConfirmed: false", "legalConfirmed: true"));
    const result = spawnSync(process.execPath, [join(root, "scripts", "prepare-new-talgo-publication.mjs")], {
      env: { ...process.env, GASTROHELP_DEPLOYMENT_MODE: "approved-production", NEW_TALGO_PUBLICATION_APPROVED: "yes", NEW_TALGO_INDEXING_APPROVED: "yes", NEW_TALGO_PUBLIC_HOST: "newtalgo.gastrohelp.es", NEW_TALGO_PUBLIC_BASE_URL: "https://newtalgo.gastrohelp.es/" },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const home = readFileSync(join(root, "public", "new-talgo", "index.html"), "utf8");
    const menu = readFileSync(join(root, "public", "new-talgo", "carta.html"), "utf8");
    const visit = readFileSync(join(root, "public", "new-talgo", "visitanos.html"), "utf8");
    assert.match(home, /<link rel="canonical" href="https:\/\/newtalgo\.gastrohelp\.es\/">/);
    assert.match(menu, /<link rel="canonical" href="https:\/\/newtalgo\.gastrohelp\.es\/carta\.html">/);
    for (const html of [home, menu, visit]) {
      assert.match(html, /<meta property="og:title" content="[^"]+">/);
      assert.match(html, /<meta property="og:description" content="[^"]+">/);
      assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
      assert.match(html, /<meta name="robots" content="index,follow">/);
    }
    assert.match(home, /<script type="application\/ld\+json">/);
    assert.doesNotMatch(menu, /<script type="application\/ld\+json">/);
    assert.match(home, /og:image" content="https:\/\/newtalgo\.gastrohelp\.es\/assets\/photos\/comedor-real-1600\.webp"/);
    assert.match(menu, /og:image" content="https:\/\/newtalgo\.gastrohelp\.es\/assets\/photos\/instagram-hamburguesa-patatas\.webp"/);
    assert.match(menu, /og:image:alt" content="Hamburguesa con patatas de New Talgo"/);
    assert.match(visit, /og:image" content="https:\/\/newtalgo\.gastrohelp\.es\/assets\/photos\/fachada-real-1600\.webp"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("final-host redirects point duplicate New Talgo paths at their canonical pages", () => {
  const script = `import config from './next.config.ts'; console.log(JSON.stringify({ redirects: await config.redirects(), headers: await config.headers() }));`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", GASTROHELP_DEPLOYMENT_MODE: "restricted-preview", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "codex/new-talgo-premium-reservas", NEW_TALGO_PUBLIC_HOST: "newtalgo.gastrohelp.es" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const { redirects, headers } = JSON.parse(result.stdout);
  for (const [source, destination] of [["/new-talgo", "/"], ["/new-talgo/index.html", "/"], ["/new-talgo/carta.html", "/carta.html"], ["/new-talgo/visitanos.html", "/visitanos.html"]]) {
    const redirect = redirects.find((entry) => entry.source === source && entry.destination === destination);
    assert.ok(redirect?.permanent, `${source}: missing permanent canonical redirect`);
    assert.deepEqual(redirect.has, [{ type: "host", value: "newtalgo.gastrohelp.es" }]);
  }
  const bookingHeaders = headers.find((entry) => entry.source === "/new-talgo/reservar")?.headers;
  assert.ok(bookingHeaders?.some((entry) => entry.key === "X-Robots-Tag" && entry.value.includes("noindex")));
});

test("final-host robots allow only public pages and rendering assets", () => {
  const robots = newTalgoPublicRobots("newtalgo.gastrohelp.es");
  assert.match(robots, /^Disallow: \/$/m);
  for (const path of ["/$", "/carta.html$", "/visitanos.html$", "/assets/", "/styles.css$", "/sitemap.xml$"]) {
    assert.ok(robots.includes(`Allow: ${path}\n`), `missing crawl rule: ${path}`);
  }
  assert.doesNotMatch(robots, /Allow: \/(?:admin|dashboard|panel-personalizado|new-talgo\/reservar)/);
  assert.match(robots, /Sitemap: https:\/\/newtalgo\.gastrohelp\.es\/sitemap\.xml/);
});
