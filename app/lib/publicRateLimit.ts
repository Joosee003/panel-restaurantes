import "server-only";

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "./supabaseAdmin";

export async function consumePublicRateLimit(
  request: NextRequest,
  scope: string,
  discriminator: string,
  limit: number,
  windowSeconds = 600,
) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const secret =
    process.env.BOOKING_RATE_LIMIT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "local-development";
  const keyHash = createHash("sha256")
    .update(`${secret}:${scope}:${discriminator}:${ip}`)
    .digest("hex");

  const { data, error } = await getSupabaseAdmin().rpc(
    "consumir_limite_reserva_publica",
    {
      p_key_hash: keyHash,
      p_limite: limit,
      p_ventana_segundos: windowSeconds,
    },
  );

  if (error) throw error;
  return data === true;
}
