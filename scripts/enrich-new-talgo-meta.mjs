import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../../../../", import.meta.url);
const staged = new URL("../public/new-talgo/", import.meta.url);
for (const base of [root, staged]) {
  for (const filename of ["index.html", "carta.html", "visitanos.html"]) {
    const path = new URL(filename, base);
    let html = await readFile(path, "utf8");
    if (html.includes('property="og:title"')) continue;
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    if (!title || !description) throw new Error(`SEO_METADATA_SOURCE_MISSING: ${filename}`);
    const tags = `<meta property="og:type" content="website"><meta property="og:locale" content="es_ES"><meta property="og:site_name" content="New Talgo"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta name="twitter:card" content="summary">`;
    html = html.replace(`  <title>${title}</title>`, `  <title>${title}</title>\n  ${tags}`);
    await writeFile(path, html, "utf8");
  }
}
