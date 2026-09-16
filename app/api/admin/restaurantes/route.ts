import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";
import { googleReviewUrl } from "@/lib/reviews/review-flow";
import { serviceDependencies } from "@/lib/admin/onboarding";
import { authorizeAgency } from "@/lib/admin/authorize";
import { deliverInvitation } from "@/lib/admin/invitations";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY_BYTES = 32_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PLANS = new Set(["basico", "premium"]);

type InstallationResult = {
  restaurante_id?: unknown;
  invitation_id?: unknown;
  replayed?: boolean;
};

type NormalizedInput = {
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  email: string;
  capacidad: number;
  mesas: number;
  plan: "basico" | "premium";
  cartaNombre: string;
  activarReservas: boolean;
  activarClientes: boolean;
  activarResenas: boolean;
  activarFidelizacion: boolean;
  activarMetricas: boolean;
  activarChatbot: boolean;
  activarCamarero: boolean;
  activarMenuDigital: boolean;
  activarAutomatizaciones: boolean;
  activarReputacion: boolean;
  googleReviewUrl: string | null;
  zonaHoraria: string;
};

class InputError extends Error {}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function cleanText(
  value: unknown,
  field: string,
  maxLength: number,
  required = false,
) {
  if (value == null && !required) return null;
  if (typeof value !== "string") throw new InputError(field);

  const cleaned = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (required && !cleaned) throw new InputError(field);
  if (cleaned.length > maxLength) throw new InputError(field);
  return cleaned || null;
}

function integerInRange(
  value: unknown,
  field: string,
  min: number,
  max: number,
) {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new InputError(field);
  }

  const parsed = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new InputError(field);
  }
  return parsed;
}

function booleanField(value: unknown, field: string) {
  if (typeof value !== "boolean") throw new InputError(field);
  return value;
}

function normalizeInput(value: unknown): NormalizedInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("body");
  }

  const input = value as Record<string, unknown>;
  const nombre = cleanText(input.nombre, "nombre", 120, true);
  const telefono = cleanText(input.telefono, "telefono", 40);
  const direccion = cleanText(input.direccion, "direccion", 300);
  const emailValue = cleanText(input.email, "email", 254, true);
  const cartaNombre = cleanText(input.cartaNombre, "cartaNombre", 120, true);

  if (!nombre || !emailValue || !cartaNombre) {
    throw new InputError("required");
  }

  const email = emailValue.toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new InputError("email");

  const plan = cleanText(input.plan, "plan", 20, true);
  if (!plan || !VALID_PLANS.has(plan)) throw new InputError("plan");

  const reviewLink = cleanText(input.googleReviewUrl, "googleReviewUrl", 2048);
  if (reviewLink && !googleReviewUrl(reviewLink))
    throw new InputError("googleReviewUrl");
  const zonaHoraria = input.zonaHoraria ?? "Europe/Madrid";
  if (zonaHoraria !== "Europe/Madrid" && zonaHoraria !== "Atlantic/Canary")
    throw new InputError("zonaHoraria");
  const normalized = {
    nombre,
    telefono,
    direccion,
    email,
    capacidad: integerInRange(input.capacidad, "capacidad", 1, 5_000),
    mesas: integerInRange(input.mesas, "mesas", 1, 80),
    plan: plan as NormalizedInput["plan"],
    cartaNombre,
    activarReservas: booleanField(input.activarReservas, "activarReservas"),
    activarClientes: booleanField(input.activarClientes, "activarClientes"),
    activarResenas: booleanField(input.activarResenas, "activarResenas"),
    activarFidelizacion: booleanField(
      input.activarFidelizacion,
      "activarFidelizacion",
    ),
    activarMetricas: booleanField(input.activarMetricas, "activarMetricas"),
    activarChatbot: booleanField(input.activarChatbot, "activarChatbot"),
    activarCamarero: booleanField(input.activarCamarero, "activarCamarero"),
    activarMenuDigital: booleanField(
      input.activarMenuDigital,
      "activarMenuDigital",
    ),
    activarAutomatizaciones: booleanField(
      input.activarAutomatizaciones,
      "activarAutomatizaciones",
    ),
    activarReputacion:
      input.activarReputacion === undefined
        ? false
        : booleanField(input.activarReputacion, "activarReputacion"),
    googleReviewUrl: reviewLink,
    zonaHoraria,
  };
  if (serviceDependencies(normalized)) throw new InputError("services");
  return normalized;
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  return match?.[1] || null;
}

function rpcErrorCode(error: { message?: string }) {
  const message = error.message || "";
  const known = [
    "ADMIN_REQUIRED",
    "NAME_REQUIRED",
    "VALID_EMAIL_REQUIRED",
    "EMAIL_ALREADY_REGISTERED",
    "INVITATION_ALREADY_EXISTS",
    "INVALID_SERVICE_DEPENDENCIES",
    "NO_SERVICES",
    "INVALID_TIMEZONE",
    "REQUEST_CONFLICT",
  ];
  return known.find((code) => message.includes(code)) || null;
}

export async function POST(request: NextRequest) {

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "INVALID_INPUT" }, 413);
  }

  const accessToken = bearerToken(request);
  if (!accessToken) {
    return json({ ok: false, error: "INVALID_SESSION" }, 401);
  }

  try {
    const admin = getSupabaseAdmin();
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(accessToken);

    if (userError || !user) {
      return json({ ok: false, error: "INVALID_SESSION" }, 401);
    }

    const { data: adminAccess, error: adminError } = await admin
      .from("app_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminError) {
      console.error("admin access check failed", adminError.code);
      return json({ ok: false, error: "SERVER_ERROR" }, 503);
    }

    if (!adminAccess?.user_id) {
      return json({ ok: false, error: "ADMIN_REQUIRED" }, 403);
    }

    let input: NormalizedInput;
    let requestId: string;
    try {
      const body = await request.text();
      if (new TextEncoder().encode(body).length > MAX_BODY_BYTES)
        return json({ ok: false, error: "INVALID_INPUT" }, 413);
      const parsed = JSON.parse(body);
      requestId = parsed?.request_id;
      if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new InputError("request_id");
      input = normalizeInput(parsed);
    } catch (error) {
      if (error instanceof InputError || error instanceof SyntaxError) {
        return json({ ok: false, error: "INVALID_INPUT" }, 400);
      }
      throw error;
    }

    const { data: installationData, error: installationError } =
      await admin.rpc("admin_create_onboarding", {
        p_request_id: requestId,
        p_admin_user_id: user.id,
        p_config: input,
      });

    if (installationError) {
      const code = rpcErrorCode(installationError);
      if (code === "REQUEST_CONFLICT") return json({ ok: false, error: code }, 409);
      if (code === "EMAIL_ALREADY_REGISTERED") {
        return json({ ok: false, error: code }, 409);
      }
      if (code === "INVITATION_ALREADY_EXISTS") {
        return json({ ok: false, error: "EMAIL_ALREADY_REGISTERED" }, 409);
      }
      if (code === "ADMIN_REQUIRED") {
        return json({ ok: false, error: code }, 403);
      }
      if (
        code === "NAME_REQUIRED" ||
        code === "VALID_EMAIL_REQUIRED" ||
        code === "INVALID_SERVICE_DEPENDENCIES" ||
        code === "NO_SERVICES" ||
        code === "INVALID_TIMEZONE"
      ) {
        return json({ ok: false, error: "INVALID_INPUT" }, 400);
      }

      console.error(
        "admin restaurant installation failed",
        installationError.code,
      );
      return json({ ok: false, error: "INSTALLATION_FAILED" }, 500);
    }

    const installation = installationData as InstallationResult | null;
    const restauranteId =
      typeof installation?.restaurante_id === "string"
        ? installation.restaurante_id
        : null;
    const invitationId =
      typeof installation?.invitation_id === "string"
        ? installation.invitation_id
        : null;
    if (!restauranteId || !invitationId) return json({ ok: false, error: "INSTALLATION_FAILED" }, 500);
    // The SQL transaction is durable. Email is a separate, resumable action.
    let invitationStatus = "uncertain";
    try {
      invitationStatus = await deliverInvitation(admin, user.id, restauranteId);
    } catch {
      // Return the saved restaurant even when email status is temporarily unavailable.
    }
    return json({ ok: true, restaurante_id: restauranteId, invited_email: input.email,
      invitation_status: invitationStatus, replayed: installation?.replayed === true }, installation?.replayed ? 200 : 201);
  } catch {
    // A lost database response can be recovered with the same request_id.
    return json({ ok: false, error: "SERVER_ERROR" }, 503);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await authorizeAgency(request);
    if (access.error)
      return json({ ok: false, error: access.error }, access.status);
    const body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES)
      return json({ ok: false, error: "INVALID_INPUT" }, 413);
    const input = JSON.parse(body) as Record<string, unknown>;
    if (
      !input ||
      typeof input.restaurante_id !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        input.restaurante_id,
      )
    )
      return json({ ok: false, error: "INVALID_INPUT" }, 400);
    const telefono = cleanText(input.telefono, "telefono", 40);
    const direccion = cleanText(input.direccion, "direccion", 300);
    if (telefono && !/^[0-9]{7,15}$/.test(telefono.replace(/[\s().+-]/g, "")))
      return json({ ok: false, error: "INVALID_INPUT" }, 400);
    const result = await access.admin
      .from("restaurantes")
      .update({ telefono, direccion })
      .eq("id", input.restaurante_id)
      .select("id")
      .maybeSingle();
    if (result.error) return json({ ok: false, error: "SAVE_FAILED" }, 503);
    if (!result.data) return json({ ok: false, error: "NOT_FOUND" }, 404);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof InputError)
      return json({ ok: false, error: "INVALID_INPUT" }, 400);
    return json({ ok: false, error: "SAVE_FAILED" }, 503);
  }
}
