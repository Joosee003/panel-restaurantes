import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateRestaurantBody = {
  nombre?: string;
  telefono?: string;
  direccion?: string;
  email?: string;
  capacidad?: number | string;
  mesas?: number | string;
  plan?: string;
  cartaNombre?: string;
  activarReservas?: boolean;
  activarClientes?: boolean;
  activarResenas?: boolean;
  activarFidelizacion?: boolean;
  activarMetricas?: boolean;
  activarChatbot?: boolean;
  activarCamarero?: boolean;
  activarMenuDigital?: boolean;
  activarAutomatizaciones?: boolean;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "SERVER_AUTH_NOT_CONFIGURED" }, 500);
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return json({ ok: false, error: "AUTH_REQUIRED" }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await adminClient.auth.getUser(accessToken);

  if (userError || !user) {
    return json({ ok: false, error: "INVALID_SESSION" }, 401);
  }

  const { data: adminAccess, error: adminError } = await adminClient
    .from("app_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError || !adminAccess?.user_id) {
    return json({ ok: false, error: "ADMIN_REQUIRED" }, 403);
  }

  let body: CreateRestaurantBody;
  try {
    body = (await request.json()) as CreateRestaurantBody;
  } catch {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const nombre = cleanText(body.nombre, 120);
  const email = cleanText(body.email, 254).toLowerCase();
  const telefono = cleanText(body.telefono, 40);
  const direccion = cleanText(body.direccion, 240);
  const cartaNombre = cleanText(body.cartaNombre, 120) || "Carta principal";
  const capacidad = boundedNumber(body.capacidad, 40, 1, 5000);
  const mesas = boundedNumber(body.mesas, 8, 1, 80);
  const allowedPlans = new Set(["base", "basico", "pro", "premium", "demo"]);
  const requestedPlan = cleanText(body.plan, 30).toLowerCase();
  const plan = allowedPlans.has(requestedPlan) ? requestedPlan : "premium";

  if (nombre.length < 2) {
    return json({ ok: false, error: "NAME_REQUIRED" }, 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "VALID_EMAIL_REQUIRED" }, 400);
  }

  const { data: installation, error: installationError } = await adminClient.rpc(
    "admin_crear_instalacion_restaurante",
    {
      p_admin_user_id: user.id,
      p_nombre: nombre,
      p_telefono: telefono || null,
      p_direccion: direccion || null,
      p_email: email,
      p_capacidad: capacidad,
      p_mesas: mesas,
      p_plan: plan,
      p_carta_nombre: cartaNombre,
      p_reservas: body.activarReservas !== false,
      p_clientes: body.activarClientes !== false,
      p_resenas: body.activarResenas !== false,
      p_fidelizacion: body.activarFidelizacion !== false,
      p_metricas: body.activarMetricas !== false,
      p_chatbot: body.activarChatbot === true,
      p_camarero_digital: body.activarCamarero !== false,
      p_menu_digital: body.activarMenuDigital !== false,
      p_automatizaciones: body.activarAutomatizaciones === true,
    },
  );

  if (installationError || !installation) {
    console.error("Error creando instalación", installationError);
    return json({ ok: false, error: "INSTALLATION_CREATE_FAILED" }, 400);
  }

  const result = installation as {
    restaurante_id?: string;
    invitation_id?: string;
    public_token?: string;
  };

  if (!result.restaurante_id || !result.invitation_id) {
    return json({ ok: false, error: "INSTALLATION_RESULT_INVALID" }, 500);
  }

  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const siteUrl = configuredSiteUrl || request.nextUrl.origin;
  const redirectTo = new URL("/auth/accept-invite", siteUrl).toString();

  const { data: invitation, error: invitationError } =
    await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        invitation_id: result.invitation_id,
        restaurante_id: result.restaurante_id,
        account_type: "restaurant",
      },
    });

  if (invitationError || !invitation.user) {
    console.error("Error enviando invitación", invitationError);

    await adminClient.rpc("admin_cancelar_instalacion_pendiente", {
      p_admin_user_id: user.id,
      p_restaurante_id: result.restaurante_id,
      p_invitation_id: result.invitation_id,
    });

    const alreadyExists = /already|registered|exists/i.test(
      invitationError?.message || "",
    );

    return json(
      {
        ok: false,
        error: alreadyExists ? "EMAIL_ALREADY_REGISTERED" : "INVITE_SEND_FAILED",
      },
      400,
    );
  }

  return json(
    {
      ok: true,
      restaurante_id: result.restaurante_id,
      public_token: result.public_token || null,
      invited_email: email,
    },
    201,
  );
}
