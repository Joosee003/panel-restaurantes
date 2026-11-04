import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { dispatchNewTalgoLiveEvents } from "@/lib/owner-notices/new-talgo-live-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function matchesSecret(provided: string | null, expected: string) {
  if (!provided || expected.length < 32) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (process.env.GASTROHELP_DEPLOYMENT_MODE !== "approved-production") return json({ ok: false }, 404);
  const secret = process.env.N8N_NATIVE_BOOKING_WEBHOOK_SECRET?.trim() || "";
  if (!matchesSecret(request.headers.get("x-new-talgo-dispatch-secret"), secret)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const result = await dispatchNewTalgoLiveEvents();
    return json({ ok: true, ...result });
  } catch {
    return json({ ok: false, error: "NEW_TALGO_LIVE_DISPATCH_FAILED" }, 500);
  }
}

