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
if (content.openingHours !== "Martes a domingo, 11:30–23:30. Lunes cerrado."
  || content.instagramOfficial !== "https://www.instagram.com/new_talgo_/") {
  throw new Error("NEW_TALGO_SEO_FACTS_REQUIRE_REVIEW");
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
  const socialPhotos = {
    "index.html": { src: "assets/photos/comedor-real-1600.webp", alt: "Comedor de New Talgo en Segovia" },
    "carta.html": { src: content.photos?.menu?.src, alt: "Hamburguesa con patatas de New Talgo" },
    "visitanos.html": { src: content.photos?.facade?.src, alt: "Fachada de New Talgo en Carretera de Villacastín" },
  };
  const socialPhoto = socialPhotos[page];
  const photoTag = typeof socialPhoto.src === "string" && /^assets\/photos\/[a-z0-9._-]+\.webp$/.test(socialPhoto.src)
    ? `<meta property="og:image" content="${new URL(socialPhoto.src, base).href}"><meta property="og:image:alt" content="${socialPhoto.alt}"><meta name="twitter:image" content="${new URL(socialPhoto.src, base).href}">` : "";
  let seoTags = `<link rel="canonical" href="${canonical}"><meta property="og:type" content="website"><meta property="og:locale" content="es_ES"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${canonical}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}">${photoTag}`;
  if (page === "index.html") {
    const schema = {
      "@context": "https://schema.org", "@type": "Restaurant", name: content.businessName,
      url: canonical, menu: new URL("carta.html", base).href, telephone: content.phone,
      sameAs: content.instagramOfficial,
      openingHoursSpecification: {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        opens: "11:30", closes: "23:30",
      },
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
