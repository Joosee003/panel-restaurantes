import "server-only";

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "./supabaseAdmin";

function getClientIp(request: NextRequest) {
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for") || "";
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return (
    vercelForwarded.split(",")[0]?.trim() ||
    forwarded.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function consumeHashedLimit(
  keyHash: string,
  limit: number,
  windowSeconds: number,
) {
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

export async function consumePublicRateLimit(
  request: NextRequest,
  scope: string,
  discriminator: string,
  limit: number,
  windowSeconds = 600,
) {
  const ip = getClientIp(request);
  const secret =
    process.env.BOOKING_RATE_LIMIT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "local-development";
  const globalKeyHash = createHash("sha256")
    .update(`${secret}:${scope}:ip:${ip}`)
    .digest("hex");
  const resourceKeyHash = createHash("sha256")
    .update(`${secret}:${scope}:resource:${discriminator}:${ip}`)
    .digest("hex");

  const globalAllowed = await consumeHashedLimit(
    globalKeyHash,
    limit,
    windowSeconds,
  );
  if (!globalAllowed) return false;

  return consumeHashedLimit(resourceKeyHash, limit, windowSeconds);
}
