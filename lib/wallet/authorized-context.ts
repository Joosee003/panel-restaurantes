import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { WalletMemberContext } from "./types";

export async function getAuthorizedWalletContext(request: Request, slug: string) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!bearer || !url || !key) return null;

  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await auth.auth.getUser(bearer);
  if (userError || !userData.user?.id || !userData.user.phone) return null;

  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("club_get_wallet_context", { p_slug: slug });
  if (error || !data) return null;
  return { context: data as WalletMemberContext, userId: userData.user.id };
}
