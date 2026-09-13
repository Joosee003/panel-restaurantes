import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { reviewWhatsAppConfigured } from "@/lib/reviews/review-delivery";
import { getWahaChannelForRestaurant } from "@/lib/whatsapp/waha-store";
import { wahaConfigured } from "@/lib/whatsapp/waha-api";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  const restaurantId = request.nextUrl.searchParams.get("restaurantId") || "";
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer \S+$/.test(authorization) || !/^[0-9a-f-]{36}$/i.test(restaurantId)) {
    return NextResponse.json({ configured: false }, { status: 401, headers });
  }
  try {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const user = await client.auth.getUser(authorization.slice(7));
    if (user.error || !user.data.user) return NextResponse.json({ configured: false }, { status: 401, headers });
    const access = await client.rpc("puede_acceder_restaurante", { p_restaurante_id: restaurantId });
    if (access.error || access.data !== true) return NextResponse.json({ configured: false }, { status: 403, headers });
    const channel = await getWahaChannelForRestaurant(getSupabaseAdmin(), restaurantId);
    const configured = channel
      ? channel.enabled && channel.reviews_enabled && channel.status === "WORKING" && Boolean(channel.phone_e164) && wahaConfigured()
      : reviewWhatsAppConfigured(process.env, restaurantId);
    return NextResponse.json({ configured }, { headers });
  } catch { return NextResponse.json({ configured: false }, { status: 503, headers }); }
}
