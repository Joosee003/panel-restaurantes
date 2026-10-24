import { readFile, writeFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

if (process.env.GASTROHELP_DEPLOYMENT_MODE !== "approved-production") process.exit(0);
if (process.env.NEW_TALGO_PUBLICATION_APPROVED !== "yes") throw new Error("NEW_TALGO_PUBLICATION_APPROVAL_REQUIRED");
const baseRaw = process.env.NEW_TALGO_PUBLIC_BASE_URL;
if (!baseRaw) throw new Error("NEW_TALGO_PUBLIC_BASE_URL_REQUIRED");
const base = new URL(baseRaw);
const customHost = process.env.NEW_TALGO_PUBLIC_HOST?.toLowerCase().trim();
if (base.protocol !== "https:" || base.search || base.hash || base.username || base.password
  || (customHost && (base.hostname !== customHost || base.pathname !== "/"))
  || (!customHost && base.pathname !== "/new-talgo/")) {
  throw new Error("NEW_TALGO_PUBLIC_BASE_URL_INVALID");
}
const folder = new URL("../public/new-talgo/", import.meta.url);
const sandbox = { window: {} };
runInNewContext(await readFile(new URL("content.js", folder), "utf8"), sandbox);
const content = sandbox.window.NEW_TALGO_CONTENT;
for (const flag of ["addressConfirmed", "phoneConfirmed", "openingHoursConfirmed", "menuConfirmed", "photoRightsConfirmed", "legalConfirmed"]) {
  if (content?.[flag] !== true) throw new Error(`NEW_TALGO_CONFIRMATION_MISSING:${flag}`);
}
if (!/^\+?[0-9\s()-]{7,20}$/.test(content.phone || "") || !content.openingHours
  || !content.streetAddress || !content.postalCode || !content.addressLocality || content.addressCountry !== "ES") {
  throw new Error("NEW_TALGO_CONFIRMED_CONTACT_DETAILS_REQUIRED");
}
const pages = ["index.html", "carta.html", "visitanos.html"];
const prepared = [];
for (const page of pages) {
  const path = new URL(page, folder);
  let html = await readFile(path, "utf8");
  if (/vista previa local|pendiente de confirm|fotograf[ií]a pendiente|espacio reservado|en estudio|propuesta pendiente/i.test(html)) {
    throw new Error(`NEW_TALGO_PROVISIONAL_COPY_REMAINS:${page}`);
  }
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  if (!title || !description) throw new Error(`NEW_TALGO_SEO_MISSING:${page}`);
  const canonical = new URL(page === "index.html" ? "" : page, base).href;
  if (process.env.NEW_TALGO_INDEXING_APPROVED === "yes") {
    html = html.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="index,follow">');
  }
  html = html.replace(/<div class="preview-banner">.*?<\/div>/s, "");
  html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title}">`);
  html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${description}">`);
  const heroPhoto = content.photos?.hero?.src;
  const photoTag = typeof heroPhoto === "string" && /^assets\/photos\/[a-z0-9._-]+\.webp$/.test(heroPhoto)
    ? `<meta property="og:image" content="${new URL(heroPhoto, base).href}"><meta property="og:image:alt" content="Comida fotografiada para New Talgo">` : "";
  let seoTags = `<link rel="canonical" href="${canonical}"><meta property="og:url" content="${canonical}">${photoTag}`;
  if (page === "index.html") {
    const schema = {
      "@context": "https://schema.org", "@type": "Restaurant", name: content.businessName,
      url: canonical, menu: new URL("carta.html", base).href, telephone: content.phone,
      address: { "@type": "PostalAddress", streetAddress: content.streetAddress, postalCode: content.postalCode,
        addressLocality: content.addressLocality, addressCountry: content.addressCountry },
    };
    seoTags += `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`;
  }
  html = html.replace(/<\/head>/, `${seoTags}\n</head>`);
  prepared.push([path, html]);
}
for (const [path, html] of prepared) await writeFile(path, html, "utf8");
process.stdout.write("New Talgo publication assets prepared after local approval gates.\n");
