import { NextRequest, NextResponse } from "next/server";
import { LEGAL_DOCUMENTS } from "../lib/publicLegal";
import {
  getPublicRestaurantByDomain,
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
  const restaurant = await getPublicRestaurantByDomain(host);
  if (!restaurant) return new NextResponse("Not found", { status: 404 });

  const origin = `https://${host}`;
  const urls = [origin, ...LEGAL_DOCUMENTS.map((document) => `${origin}/legal/${document}`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}\n</urlset>\n`;

  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
