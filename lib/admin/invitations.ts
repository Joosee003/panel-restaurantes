import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type InvitationDelivery = "not_requested" | "sending" | "accepted" | "failed" | "uncertain" | "account_ready";

// Email acceptance is not proof of delivery. Never delete an installation after
// a provider timeout: the user may already exist and have received the link.
export async function deliverInvitation(admin: SupabaseClient, actor: string, restaurantId: string, retry = false): Promise<InvitationDelivery> {
  const claim = await admin.rpc("admin_claim_invitation", {
    p_admin_user_id: actor, p_restaurante_id: restaurantId, p_retry: retry,
  });
  if (claim.error || !claim.data) throw new Error("INVITATION_UNAVAILABLE");
  if (!claim.data.claimed) return claim.data.status as InvitationDelivery;
  const { invitation_id: invitationId, email, auth_user_id: existingUser, lock } = claim.data;
  const finish = async (status: "accepted" | "failed" | "uncertain", error: string | null = null) => {
    const saved = await admin.rpc("admin_finish_invitation", {
      p_admin_user_id: actor, p_restaurante_id: restaurantId, p_lock: lock, p_status: status, p_error: error,
    });
    return saved.error || saved.data !== true ? "uncertain" as const : status;
  };
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://panel.gastrohelp.es").replace(/\/$/, "");
  let attempted = false;
  try {
    let userId = existingUser as string | null;
    if (userId) {
      // Trust the database invitation link and current Auth email, never user metadata.
      const user = await admin.auth.admin.getUserById(userId);
      if (user.error || user.data.user?.email?.toLowerCase() !== email.toLowerCase())
        return finish("failed", "INVITATION_LINK_MISMATCH");
      attempted = true;
      const sent = await admin.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/auth/accept-invite` });
      if (sent.error) return finish("failed", "EMAIL_NOT_ACCEPTED");
    } else {
      attempted = true;
      const sent = await admin.auth.admin.inviteUserByEmail(email, {
        data: { invitation_id: invitationId, restaurante_id: restaurantId },
        redirectTo: `${siteUrl}/auth/accept-invite`,
      });
      if (sent.error || !sent.data.user?.id) return finish("failed", "EMAIL_NOT_ACCEPTED");
      userId = sent.data.user.id;
    }
    const [assignment, invitation, restaurant, reputation] = await Promise.all([
      admin.from("usuarios_restaurantes").select("user_id").eq("user_id", userId).eq("restaurante_id", restaurantId).maybeSingle(),
      admin.from("restaurant_invitations").select("auth_user_id,status").eq("id", invitationId).eq("restaurante_id", restaurantId).maybeSingle(),
      admin.from("restaurantes").select("owner_id").eq("id", restaurantId).maybeSingle(),
      admin.from("opinion_config").select("restaurante_id").eq("restaurante_id", restaurantId).maybeSingle(),
    ]);
    if ([assignment, invitation, restaurant, reputation].some(r => r.error)
      || assignment.data?.user_id !== userId || invitation.data?.auth_user_id !== userId
      || restaurant.data?.owner_id !== userId)
      return finish("uncertain", "INVITATION_LINK_UNVERIFIED");
    if (reputation.data) {
      const access = await admin.from("opinion_usuarios_restaurantes").upsert({
        user_id: userId, restaurante_id: restaurantId, role: "restaurante", active: true,
      }, { onConflict: "user_id,restaurante_id" });
      if (access.error) return finish("uncertain", "REPUTATION_ACCESS_PENDING");
    }
    return finish("accepted");
  } catch {
    return finish(attempted ? "uncertain" : "failed", attempted ? "RESULT_UNKNOWN" : "INVITATION_UNAVAILABLE");
  }
}
