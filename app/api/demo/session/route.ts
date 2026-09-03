import "server-only";

import { createClient, type Session } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { consumePublicRateLimit } from "@/app/lib/publicRateLimit";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";

const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || "demo@gastrohelp.es";

function sessionPayload(session: Session) {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
}

export async function POST(request: NextRequest) {
  try {
    const allowed = await consumePublicRateLimit(
      request,
      "demo-session",
      "public-demo",
      30,
      600,
    );

    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "DEMO_RATE_LIMIT" },
        { status: 429, headers: { "Retry-After": "600" } },
      );
    }

    const admin = getSupabaseAdmin();
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email: DEMO_EMAIL,
      });

    if (linkError || !linkData.properties.hashed_token || !linkData.user?.id) {
      console.error("demo generateLink", linkError);
      return NextResponse.json(
        { ok: false, error: "DEMO_NOT_AVAILABLE" },
        { status: 503 },
      );
    }

    const { data: assignment, error: assignmentError } = await admin
      .from("usuarios_restaurantes")
      .select("demo_vista")
      .eq("user_id", linkData.user.id)
      .maybeSingle();

    if (assignmentError || !assignment?.demo_vista) {
      console.error("demo assignment", assignmentError);
      return NextResponse.json(
        { ok: false, error: "DEMO_NOT_CONFIGURED" },
        { status: 503 },
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !publishableKey) {
      throw new Error("SUPABASE_PUBLIC_NOT_CONFIGURED");
    }

    const publicAuth = createClient(url, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data: verified, error: verifyError } =
      await publicAuth.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: "email",
      });

    if (verifyError || !verified.session) {
      console.error("demo verifyOtp", verifyError);
      return NextResponse.json(
        { ok: false, error: "DEMO_NOT_AVAILABLE" },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { ok: true, session: sessionPayload(verified.session) },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    console.error("POST /api/demo/session", error);
    return NextResponse.json(
      { ok: false, error: "DEMO_NOT_AVAILABLE" },
      { status: 503 },
    );
  }
}
