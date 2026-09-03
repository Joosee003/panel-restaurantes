import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PLANS = new Set(["basico", "premium"]);

type InstallationResult = {
  restaurante_id?: unknown;
  invitation_id?: unknown;
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
  const cartaNombre = cleanText(
    input.cartaNombre,
    "cartaNombre",
    120,
    true,
  );

  if (!nombre || !emailValue || !cartaNombre) {
    throw new InputError("required");
  }

  const email = emailValue.toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new InputError("email");

  const plan = cleanText(input.plan, "plan", 20, true);
  if (!plan || !VALID_PLANS.has(plan)) throw new InputError("plan");

  return {
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
  };
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  return match?.[1] || null;
}

function isDuplicateEmailError(error: { code?: string; message?: string }) {
  const detail = `${error.code || ""} ${error.message || ""}`.toLowerCase();
  return (
    detail.includes("email_exists") ||
    detail.includes("already been registered") ||
    detail.includes("already registered") ||
    detail.includes("user already exists")
  );
}

function rpcErrorCode(error: { message?: string }) {
  const message = error.message || "";
  const known = [
    "ADMIN_REQUIRED",
    "NAME_REQUIRED",
    "VALID_EMAIL_REQUIRED",
    "EMAIL_ALREADY_REGISTERED",
    "INVITATION_ALREADY_EXISTS",
  ];
  return known.find((code) => message.includes(code)) || null;
}

async function rollbackInstallation(restauranteId: string, authUserId?: string) {
  const admin = getSupabaseAdmin();
  const { error: restaurantError } = await admin
    .from("restaurantes")
    .delete()
    .eq("id", restauranteId);

  if (restaurantError) {
    console.error("admin restaurant rollback failed", restaurantError.code);
  }

  if (authUserId) {
    const { error: userError } = await admin.auth.admin.deleteUser(authUserId);
    if (userError) {
      console.error("admin invited user rollback failed", userError.code);
    }
  }
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
    try {
      input = normalizeInput(await request.json());
    } catch (error) {
      if (error instanceof InputError || error instanceof SyntaxError) {
        return json({ ok: false, error: "INVALID_INPUT" }, 400);
      }
      throw error;
    }

    const { data: installationData, error: installationError } =
      await admin.rpc("admin_crear_instalacion_restaurante", {
        p_admin_user_id: user.id,
        p_nombre: input.nombre,
        p_telefono: input.telefono,
        p_direccion: input.direccion,
        p_email: input.email,
        p_capacidad: input.capacidad,
        p_mesas: input.mesas,
        p_plan: input.plan,
        p_carta_nombre: input.cartaNombre,
        p_reservas: input.activarReservas,
        p_clientes: input.activarClientes,
        p_resenas: input.activarResenas,
        p_fidelizacion: input.activarFidelizacion,
        p_metricas: input.activarMetricas,
        p_chatbot: input.activarChatbot,
        p_camarero_digital: input.activarCamarero,
        p_menu_digital: input.activarMenuDigital,
        p_automatizaciones: input.activarAutomatizaciones,
      });

    if (installationError) {
      const code = rpcErrorCode(installationError);
      if (code === "EMAIL_ALREADY_REGISTERED") {
        return json({ ok: false, error: code }, 409);
      }
      if (code === "INVITATION_ALREADY_EXISTS") {
        return json({ ok: false, error: "EMAIL_ALREADY_REGISTERED" }, 409);
      }
      if (code === "ADMIN_REQUIRED") {
        return json({ ok: false, error: code }, 403);
      }
      if (code === "NAME_REQUIRED" || code === "VALID_EMAIL_REQUIRED") {
        return json({ ok: false, error: "INVALID_INPUT" }, 400);
      }

      console.error("admin restaurant installation failed", installationError.code);
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

    if (!restauranteId || !invitationId) {
      console.error("admin restaurant installation returned invalid data");
      if (restauranteId) await rollbackInstallation(restauranteId);
      return json({ ok: false, error: "INSTALLATION_FAILED" }, 500);
    }

    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL || "https://panel.gastrohelp.es"
    ).replace(/\/$/, "");
    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(input.email, {
        data: {
          invitation_id: invitationId,
          restaurante_id: restauranteId,
        },
        redirectTo: `${siteUrl}/auth/accept-invite`,
      });

    if (inviteError || !inviteData.user?.id) {
      await rollbackInstallation(restauranteId, inviteData.user?.id);
      if (inviteError && isDuplicateEmailError(inviteError)) {
        return json({ ok: false, error: "EMAIL_ALREADY_REGISTERED" }, 409);
      }
      console.error("admin restaurant invitation failed", inviteError?.code);
      return json({ ok: false, error: "INVITE_SEND_FAILED" }, 502);
    }

    const [assignmentResult, invitationResult, restaurantResult] =
      await Promise.all([
        admin
          .from("usuarios_restaurantes")
          .select("user_id")
          .eq("user_id", inviteData.user.id)
          .eq("restaurante_id", restauranteId)
          .maybeSingle(),
        admin
          .from("restaurant_invitations")
          .select("status, auth_user_id")
          .eq("id", invitationId)
          .eq("restaurante_id", restauranteId)
          .maybeSingle(),
        admin
          .from("restaurantes")
          .select("owner_id")
          .eq("id", restauranteId)
          .maybeSingle(),
      ]);

    const invitationLinked =
      assignmentResult.data?.user_id === inviteData.user.id &&
      invitationResult.data?.status === "sent" &&
      invitationResult.data?.auth_user_id === inviteData.user.id &&
      restaurantResult.data?.owner_id === inviteData.user.id;

    if (
      assignmentResult.error ||
      invitationResult.error ||
      restaurantResult.error ||
      !invitationLinked
    ) {
      console.error(
        "admin restaurant invitation linkage failed",
        assignmentResult.error?.code ||
          invitationResult.error?.code ||
          restaurantResult.error?.code,
      );
      await rollbackInstallation(restauranteId, inviteData.user.id);
      return json({ ok: false, error: "INVITE_SEND_FAILED" }, 500);
    }

    return json(
      {
        ok: true,
        restaurante_id: restauranteId,
        invited_email: input.email,
      },
      201,
    );
  } catch (error) {
    console.error(
      "POST /api/admin/restaurantes",
      error instanceof Error ? error.message : "unknown error",
    );
    return json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
}
