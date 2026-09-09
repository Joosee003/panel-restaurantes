import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";
import { consumePublicRateLimit } from "@/app/lib/publicRateLimit";
import { googleReviewUrl, isReviewToken } from "@/lib/reviews/review-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privacyHeaders = { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

function problem(message: string, status: number) {
  return new NextResponse(message, { status, headers: { ...privacyHeaders, "Content-Type": "text/plain; charset=utf-8" } });
}

// No GET handler: previews, crawlers and restaurant-side checks must not register a customer click.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isReviewToken(token)) return problem("El enlace no está disponible.", 404);
  if (request.headers.get("origin") !== request.nextUrl.origin) return problem("Abre el enlace y pulsa el botón para continuar.", 403);
  if (Number(request.headers.get("content-length") || 0) > 2048) return problem("No se pudo completar la solicitud.", 413);
  try {
    const form = await request.formData();
    const action = form.get("action");
    if (action !== "google" && action !== "stop") return problem("Solicitud no válida.", 400);
    if (!await consumePublicRateLimit(request, "visit-review-link", token, 30)) return problem("Espera unos minutos y vuelve a intentarlo.", 429);
    const supabase = getSupabaseAdmin();
    if (action === "stop") {
      const { data, error } = await supabase.rpc("stop_visit_review_requests", { p_token: token });
      if (error) throw error;
      if (!data) return problem("El enlace no está disponible.", 404);
      return NextResponse.json({ ok: true }, { headers: privacyHeaders });
    }
    const { data, error } = await supabase.rpc("open_visit_review_link", { p_token: token });
    if (error) throw error;
    const target = googleReviewUrl(data?.googleUrl);
    if (!target || data?.active !== true) return problem("El enlace de Google no está disponible.", 404);
    return NextResponse.json({ ok: true, url: target }, { headers: privacyHeaders });
  } catch {
    return problem("No se pudo abrir el enlace. Vuelve a la página anterior e inténtalo de nuevo.", 503);
  }
}
