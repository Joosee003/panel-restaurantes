import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../(app)/lib/supabaseClient";

type AuthLinkType = "invite" | "recovery";

type AuthUrlOptions = {
  expectedType: AuthLinkType;
  requireUrlPayload?: boolean;
};

export async function getSessionFromAuthUrl({
  expectedType,
  requireUrlPayload = true,
}: AuthUrlOptions): Promise<Session> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const hash = new URLSearchParams(url.hash.slice(1));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const hashType = hash.get("type");
  const hasAuthPayload = Boolean(
    code || tokenHash || (accessToken && refreshToken),
  );

  if (requireUrlPayload && !hasAuthPayload) {
    throw new Error("AUTH_LINK_REQUIRED");
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
  } else if (tokenHash) {
    if (rawType !== expectedType) {
      throw new Error("AUTH_LINK_TYPE_INVALID");
    }

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType,
    });
    if (error) throw error;
  } else if (accessToken && refreshToken) {
    if (hashType && hashType !== expectedType) {
      throw new Error("AUTH_LINK_TYPE_INVALID");
    }

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw sessionError || new Error("AUTH_SESSION_MISSING");
  }

  return session;
}

export function validateNewPassword(password: string, repeatedPassword: string) {
  if (password.length < 10) {
    return "La contraseña debe tener al menos 10 caracteres.";
  }

  if (password !== repeatedPassword) {
    return "Las contraseñas no coinciden.";
  }

  return null;
}
