import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../(app)/lib/supabaseClient";

type AuthLinkType = "invite" | "recovery";

type AuthUrlOptions = {
  expectedType: AuthLinkType;
  requireUrlPayload?: boolean;
};

function clearAuthPayloadFromUrl() {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("code");
  cleanUrl.searchParams.delete("token_hash");
  cleanUrl.searchParams.delete("type");
  cleanUrl.hash = "";

  const nextUrl = `${cleanUrl.pathname}${cleanUrl.search}`;
  window.history.replaceState(window.history.state, document.title, nextUrl);
}

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

  if (hasAuthPayload) {
    clearAuthPayloadFromUrl();
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
  if (password.length < 12) {
    return "La contraseña debe tener al menos 12 caracteres.";
  }

  if (!/[a-z]/.test(password)) {
    return "Añade al menos una letra minúscula.";
  }

  if (!/[A-Z]/.test(password)) {
    return "Añade al menos una letra mayúscula.";
  }

  if (!/\d/.test(password)) {
    return "Añade al menos un número.";
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Añade al menos un símbolo.";
  }

  if (password !== repeatedPassword) {
    return "Las contraseñas no coinciden.";
  }

  return null;
}
