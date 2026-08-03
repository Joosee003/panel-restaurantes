import { NextRequest, NextResponse } from "next/server";
import {
  getPublicRestaurantByDomain,
  isPlatformDomain,
  normalizePublicDomain,
} from "../lib/publicRestaurant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const host = normalizePublicDomain(request.headers.get("host") || request.nextUrl.host);
  const platform = isPlatformDomain(host);
  const restaurant = platform ? null : await getPublicRestaurantByDomain(host);
  const body = restaurant
    ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /reserva/\nSitemap: https://${host}/sitemap.xml\n`
    : `User-agent: *\nAllow: /restaurante/\nDisallow: /admin/\nDisallow: /api/\nDisallow: /dashboard/\nDisallow: /login\nDisallow: /reserva/\n`;

  return new NextResponse(body, {
    status: restaurant || platform ? 200 : 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
