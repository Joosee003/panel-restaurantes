import "server-only";
import { getAuthorizedWalletContext } from "@/lib/wallet/authorized-context";
import { buildGoogleWalletSaveUrl, googleWalletObjectId } from "@/lib/wallet/google";
import { getWalletCapabilities } from "@/lib/wallet/capabilities";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";

export async function POST(request: Request) {
  if (!getWalletCapabilities().google.ready) {
    return Response.json({ error: "GOOGLE_WALLET_NOT_CONFIGURED" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  const body = await request.json().catch(() => null) as { slug?: unknown } | null;
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  if (!slug || slug.length > 120) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const authorized = await getAuthorizedWalletContext(request, slug);
  if (!authorized) return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: { "cache-control": "no-store" } });
  try {
    const objectId = googleWalletObjectId(authorized.context);
    const { error } = await getSupabaseAdmin().rpc("club_register_wallet_object", { p_slug: slug, p_auth_user_id: authorized.userId, p_provider: "google", p_object_id: objectId });
    if (error) throw error;
    return Response.json({ url: buildGoogleWalletSaveUrl(authorized.context) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "GOOGLE_WALLET_ISSUE_FAILED" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
