import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";
import { consumePublicRateLimit } from "@/app/lib/publicRateLimit";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set([
  "view",
  "rating_selected",
  "details_opened",
  "submitted",
  "copy_succeeded",
  "copy_failed",
  "google_opened",
  "returned_from_google",
]);
const ORIGINS = new Set([
  "mesa",
  "caja",
  "entrada",
  "portacuentas",
  "redes",
  "desconocido",
]);

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const normalizedSlug = slug.toLowerCase().trim();

    if (!SLUG_PATTERN.test(normalizedSlug)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 5_000) {
      return NextResponse.json({ ok: false }, { status: 413 });
    }

    const allowed = await consumePublicRateLimit(
      request,
      "opinion-event",
      normalizedSlug,
      120,
    );
    if (!allowed) {
      return NextResponse.json(
        { ok: false },
        { status: 429, headers: { "Retry-After": "600" } },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const eventType =
      typeof body.eventType === "string"
        ? body.eventType.toLowerCase().trim()
        : "";
    const submissionToken =
      typeof body.submissionToken === "string" &&
      UUID_PATTERN.test(body.submissionToken)
        ? body.submissionToken
        : null;
    const rawOrigin =
      typeof body.origen === "string" ? body.origen.toLowerCase().trim() : "";
    const origin = ORIGINS.has(rawOrigin) ? rawOrigin : "desconocido";
    const rating = Number(body.rating);
    const safeRating = Number.isInteger(rating) && rating >= 1 && rating <= 5
      ? rating
      : null;

    if (!EVENT_TYPES.has(eventType) || !submissionToken) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.rpc("track_opinion_event", {
      p_slug: normalizedSlug,
      p_submission_token: submissionToken,
      p_event_type: eventType,
      p_origen: origin,
      p_rating: safeRating,
    });

    if (error) {
      console.error("track_opinion_event", error);
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    return NextResponse.json(
      { ok: true },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("POST /api/opiniones/[slug]/events", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
