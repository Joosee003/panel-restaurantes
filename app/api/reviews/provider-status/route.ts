import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";
import { parseSignedReviewStatuses } from "@/lib/reviews/review-status-relay.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(status: string, code: number) {
  return NextResponse.json({ ok: code < 400, status }, {
    status: code, headers: { "Cache-Control": "private, no-store" },
  });
}

// A future n8n status relay must authenticate Meta first, then sign its exact
// body. This endpoint is not connected to the active workflow by this change.
export async function POST(request: NextRequest) {
  const secret = process.env.N8N_REVIEW_STATUS_RELAY_SECRET;
  const phoneIds = process.env.N8N_REVIEW_STATUS_PHONE_NUMBER_IDS;
  if (!secret || !phoneIds) return response("NOT_CONFIGURED", 503);
  if (Number(request.headers.get("content-length") || 0) > 65_536) return response("INVALID_EVENT", 413);
  let raw: Buffer;
  try {
    raw = Buffer.from(await request.arrayBuffer());
    if (raw.length > 65_536) return response("INVALID_EVENT", 413);
  } catch { return response("INVALID_EVENT", 400); }
  const statuses = parseSignedReviewStatuses(raw, request.headers, secret, phoneIds);
  if (!statuses) return response("FORBIDDEN", 403);
  try {
    const db = getSupabaseAdmin();
    for (const item of statuses) {
      const { error } = await db.rpc("record_review_provider_status", {
        p_message_id: item.id, p_status: item.status, p_event_at: item.at,
      });
      if (error) throw error;
    }
    return response("RECORDED", 200);
  } catch {
    // No raw provider payload, destination or customer data in logs/responses.
    return response("RETRY", 503);
  }
}
