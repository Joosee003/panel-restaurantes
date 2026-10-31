import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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
    assert.match(home, /<link rel="canonical" href="https:\/\/newtalgo\.gastrohelp\.es\/">/);
    assert.match(menu, /<link rel="canonical" href="https:\/\/newtalgo\.gastrohelp\.es\/carta\.html">/);
    for (const html of [home, menu]) {
      assert.match(html, /<meta property="og:title" content="[^"]+">/);
      assert.match(html, /<meta property="og:description" content="[^"]+">/);
      assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
      assert.match(html, /<meta name="robots" content="index,follow">/);
    }
    assert.match(home, /<script type="application\/ld\+json">/);
    assert.doesNotMatch(menu, /<script type="application\/ld\+json">/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
