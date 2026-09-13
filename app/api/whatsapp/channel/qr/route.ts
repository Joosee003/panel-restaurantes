import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";
import { getWahaQr, wahaConfigured } from "@/lib/whatsapp/waha-api";
import { getWahaChannelForRestaurant } from "@/lib/whatsapp/waha-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache",
  "Vary": "Authorization", "X-Content-Type-Options": "nosniff",
};

export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId") || "";
  const generationText = request.nextUrl.searchParams.get("generation") || "";
  const generation = /^\d+$/.test(generationText) ? Number(generationText) : NaN;
  const authorization = request.headers.get("authorization") || "";
  const json = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId)
    || !/^Bearer \S+$/.test(authorization) || !Number.isSafeInteger(generation) || generation < 1) {
    return json("INVALID_REQUEST", 400);
  }
  try {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const user = await client.auth.getUser(authorization.slice(7));
    if (user.error || !user.data.user) return json("UNAUTHORIZED", 401);
    const [access, demo] = await Promise.all([
      client.rpc("puede_acceder_restaurante", { p_restaurante_id: restaurantId }),
      client.rpc("is_demo_user"),
    ]);
    if (access.error || access.data !== true || demo.error || demo.data !== false) return json("FORBIDDEN", 403);
    if (!wahaConfigured()) return json("CONNECTION_NOT_PREPARED", 503);
    const db = getSupabaseAdmin();
    const channel = await getWahaChannelForRestaurant(db, restaurantId);
    if (!channel || channel.generation !== generation || channel.enabled || channel.status !== "SCAN_QR_CODE") {
      return json("CHANNEL_CHANGED", 409);
    }
    const qr = await getWahaQr(channel.session_name);
    // Re-read after fetching: a concurrent disconnect or number change invalidates this QR.
    const current = await getWahaChannelForRestaurant(db, restaurantId);
    if (!current || current.id !== channel.id || current.generation !== generation || current.revision !== channel.revision
      || current.enabled || current.status !== "SCAN_QR_CODE") return json("CHANNEL_CHANGED", 409);
    return new NextResponse(new Uint8Array(qr.data), { headers: { ...headers, "Content-Type": "image/png" } });
  } catch { return json("QR_UNAVAILABLE", 503); }
}
