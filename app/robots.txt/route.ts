import { NextRequest, NextResponse } from "next/server";
import {
  getPublicRestaurantByDomain,
  isPlatformDomain,
  normalizePublicDomain,
} from "../lib/publicRestaurant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const host = normalizePublicDomain(request.headers.get("host") || request.nextUrl.host);
  const indexable = process.env.GASTROHELP_DEPLOYMENT_MODE === "approved-production" && process.env.NEW_TALGO_INDEXING_APPROVED === "yes";
  let base: URL | null = null;
  try { if (process.env.NEW_TALGO_PUBLIC_BASE_URL) base = new URL(process.env.NEW_TALGO_PUBLIC_BASE_URL); } catch { /* release preflight rejects malformed URLs */ }
  if (host && host === process.env.NEW_TALGO_PUBLIC_HOST?.toLowerCase().trim()) {
    const body = indexable && base?.hostname === host
      ? "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /panel-personalizado/\nSitemap: https://" + host + "/sitemap.xml\n"
      : "User-agent: *\nDisallow: /\n";
    return new NextResponse(body, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
    });
  }
  const platform = isPlatformDomain(host);
  const restaurant = platform ? null : await getPublicRestaurantByDomain(host);
  let body = restaurant
    ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /panel-personalizado/\nDisallow: /new-talgo/\nDisallow: /reserva/\nSitemap: https://${host}/sitemap.xml\n`
    : `User-agent: *\nAllow: /restaurante/\nDisallow: /admin/\nDisallow: /api/\nDisallow: /dashboard/\nDisallow: /login\nDisallow: /panel-personalizado/\nDisallow: /new-talgo/\nDisallow: /reserva/\n`;
  if (indexable && base?.hostname === host && base.pathname === "/new-talgo/") {
    body = body.replace("Disallow: /new-talgo/", "Allow: /new-talgo/");
  }

  return new NextResponse(body, {
    status: restaurant || platform || (indexable && base?.hostname === host) ? 200 : 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
