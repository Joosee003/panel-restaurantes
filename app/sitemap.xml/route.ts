import { NextRequest, NextResponse } from "next/server";
import { LEGAL_DOCUMENTS } from "../lib/publicLegal";
import {
  getPublishedRestaurantSlugs,
  getPublicRestaurantByDomain,
  isPlatformDomain,
  normalizePublicDomain,
} from "../lib/publicRestaurant";

export const dynamic = "force-dynamic";

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[character] || character);
}

export async function GET(request: NextRequest) {
  const host = normalizePublicDomain(request.headers.get("host") || request.nextUrl.host);
  const origin = `https://${host}`;
  const indexable = process.env.GASTROHELP_DEPLOYMENT_MODE === "approved-production" && process.env.NEW_TALGO_INDEXING_APPROVED === "yes";
  let newTalgoBase: URL | null = null;
  try { if (process.env.NEW_TALGO_PUBLIC_BASE_URL) newTalgoBase = new URL(process.env.NEW_TALGO_PUBLIC_BASE_URL); } catch { /* release preflight rejects malformed URLs */ }
  const newTalgoUrls = indexable && newTalgoBase?.hostname === host
    ? [new URL("", newTalgoBase).href, new URL("carta.html", newTalgoBase).href, new URL("visitanos.html", newTalgoBase).href]
    : [];

  if (host && host === process.env.NEW_TALGO_PUBLIC_HOST?.toLowerCase().trim()) {
    if (!newTalgoUrls.length) return new NextResponse("Not found", { status: 404 });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${newTalgoUrls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}\n</urlset>\n`;
    return new NextResponse(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  }

  if (isPlatformDomain(host)) {
    const slugs = await getPublishedRestaurantSlugs();
    const urls = [
      origin,
      ...slugs.flatMap((slug) => [
        `${origin}/restaurante/${slug}`,
        ...LEGAL_DOCUMENTS.map((document) => `${origin}/restaurante/${slug}/legal/${document}`),
      ]),
      ...newTalgoUrls,
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}\n</urlset>\n`;

    return new NextResponse(xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
    });
  }

  if (newTalgoUrls.length && newTalgoBase?.pathname === "/new-talgo/") {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${newTalgoUrls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}\n</urlset>\n`;
    return new NextResponse(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  }

  const restaurant = await getPublicRestaurantByDomain(host);
  if (!restaurant) return new NextResponse("Not found", { status: 404 });

  const urls = [origin, ...LEGAL_DOCUMENTS.map((document) => `${origin}/legal/${document}`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}\n</urlset>\n`;

  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
