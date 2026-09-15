import "server-only";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";

export async function authorizeAgency(request: Request) {
  const token = /^Bearer\s+([^\s]+)$/i.exec(
    request.headers.get("authorization") || "",
  )?.[1];
  if (!token) return { error: "INVALID_SESSION", status: 401 } as const;
  const admin = getSupabaseAdmin();
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) return { error: "INVALID_SESSION", status: 401 } as const;
  const access = await admin
    .from("app_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (access.error)
    return { error: "ACCESS_CHECK_FAILED", status: 503 } as const;
  if (!access.data) return { error: "ADMIN_REQUIRED", status: 403 } as const;
  return { admin, user };
}
