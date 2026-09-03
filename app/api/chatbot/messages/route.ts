import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  CHATBOT_STATES,
  runChatbotTurn,
  type ChatbotDraft,
  type ChatbotReservation,
  type ChatbotSlot,
  type ChatbotState,
} from "../../../lib/chatbotEngine";
import { BOOKING_LEGAL_VERSION } from "../../../lib/publicLegal";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  messageId?: unknown;
  restaurantId?: unknown;
  from?: unknown;
  name?: unknown;
  text?: unknown;
  mode?: unknown;
};

type RestaurantRow = {
  id: string;
  nombre: string;
  slug: string | null;
  direccion: string | null;
  horario_comida: string | null;
  horario_cena: string | null;
};

type ModuleRow = {
  chatbot: boolean;
  menu_digital: boolean;
  estado: string;
};

type BookingConfigRow = {
  activo: boolean;
  zona_horaria: string;
  personas_minimas: number;
  personas_maximas: number;
  dias_maximos_antelacion: number;
  requiere_email: boolean;
};

type WebRow = {
  slug: string;
  publicada: boolean;
  nombre_publico: string;
  direccion_publica: string | null;
  google_maps_url: string | null;
  dominio_personalizado: string | null;
  titular_legal: string | null;
  nif_cif: string | null;
  domicilio_legal: string | null;
  email_legal: string | null;
  privacidad_email: string | null;
};

type BeginTurnResult = {
  status?: "acquired" | "busy" | "duplicate";
  state?: string;
  draft?: ChatbotDraft;
  response?: Record<string, unknown>;
  contactName?: string | null;
};

type BookingResult = {
  ok?: boolean;
  reserva_id?: string;
  inicio_at?: string;
  gestion_token?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizePhone(value: unknown) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  return digits.length >= 7 && digits.length <= 15 && digits[0] !== "0" ? `+${digits}` : "";
}

function hasValidSecret(request: NextRequest) {
  const expected =
    process.env.N8N_CHATBOT_WEBHOOK_SECRET ||
    process.env.N8N_NATIVE_BOOKING_WEBHOOK_SECRET ||
    "";
  const received = request.headers.get("x-gastrohelp-webhook-secret") || "";
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function normalizeSiteUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

function isChatbotState(value: string): value is ChatbotState {
  return (CHATBOT_STATES as readonly string[]).includes(value);
}

function rpcMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "CHATBOT_FAILED");
  }
  return "CHATBOT_FAILED";
}

export async function POST(request: NextRequest) {
  if (!hasValidSecret(request)) {
    return json({ ok: false, error: "FORBIDDEN" }, 403);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 16_000) {
    return json({ ok: false, error: "INVALID_REQUEST" }, 413);
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400);
  }

  const messageId = cleanText(body.messageId, 190);
  const restaurantId = cleanText(body.restaurantId, 36);
  const phone = normalizePhone(body.from);
  const name = cleanText(body.name, 120);
  const text = cleanText(body.text, 2000);
  const mode =
    body.mode === "test" || body.mode === "pilot"
      ? body.mode
      : body.mode === "live" || body.mode == null
        ? "live"
        : null;

  if (!messageId || !isUuid(restaurantId) || !phone || !text || !mode) {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400);
  }

  const supabase = getSupabaseAdmin();
  const [restaurantQuery, modulesQuery, bookingQuery, webQuery] = await Promise.all([
    supabase
      .from("restaurantes")
      .select("id,nombre,slug,direccion,horario_comida,horario_cena")
      .eq("id", restaurantId)
      .maybeSingle<RestaurantRow>(),
    supabase
      .from("restaurante_modulos")
      .select("chatbot,menu_digital,estado")
      .eq("restaurante_id", restaurantId)
      .maybeSingle<ModuleRow>(),
    supabase
      .from("reservas_config")
      .select("activo,zona_horaria,personas_minimas,personas_maximas,dias_maximos_antelacion,requiere_email")
      .eq("restaurante_id", restaurantId)
      .maybeSingle<BookingConfigRow>(),
    supabase
      .from("restaurante_webs")
      .select("slug,publicada,nombre_publico,direccion_publica,google_maps_url,dominio_personalizado,titular_legal,nif_cif,domicilio_legal,email_legal,privacidad_email")
      .eq("restaurante_id", restaurantId)
      .maybeSingle<WebRow>(),
  ]);

  if (restaurantQuery.error || modulesQuery.error || bookingQuery.error || webQuery.error) {
    console.error("Error cargando la configuración del chatbot", {
      restaurant: restaurantQuery.error?.code,
      modules: modulesQuery.error?.code,
      booking: bookingQuery.error?.code,
      web: webQuery.error?.code,
    });
    return json({ ok: false, error: "CHATBOT_CONFIGURATION_FAILED" }, 500);
  }

  const restaurant = restaurantQuery.data;
  const modules = modulesQuery.data;
  const booking = bookingQuery.data;
  const web = webQuery.data;
  if (!restaurant) return json({ ok: false, error: "RESTAURANT_NOT_FOUND" }, 404);

  if (mode !== "test" && (modules?.chatbot !== true || modules.estado !== "activo")) {
    return json({ ok: false, error: "CHATBOT_NOT_ENABLED" }, 409);
  }

  let menuUrl = "";
  if (modules?.menu_digital === true) {
    const { data: menu, error: menuError } = await supabase
      .from("cartas_digitales")
      .select("public_token")
      .eq("restaurante_id", restaurantId)
      .in("estado", ["activa", "publicada"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ public_token: string }>();
    if (menuError) console.error("No se ha podido cargar la carta del chatbot", menuError.code);
    if (menu?.public_token) {
      menuUrl = `${normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin)}/carta/${menu.public_token}`;
    }
  }

  const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin);
  const legalReady = Boolean(
    web?.titular_legal &&
      web.nif_cif &&
      (web.domicilio_legal || web.direccion_publica || restaurant.direccion) &&
      (web.privacidad_email || web.email_legal),
  );
  const publicBase = web?.publicada
    ? web.dominio_personalizado
      ? `https://${web.dominio_personalizado.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
      : `${siteUrl}/restaurante/${web.slug}`
    : `${siteUrl}/chatbot/${restaurantId}`;
  const lockToken = crypto.randomUUID();

  const { error: purgeError } = await supabase.rpc("purge_expired_chatbot_sessions");
  if (purgeError) {
    console.error("No se han podido limpiar las conversaciones caducadas", purgeError.code);
  }

  const { data: beginData, error: beginError } = await supabase.rpc("begin_chatbot_turn", {
    p_restaurante_id: restaurantId,
    p_contact_phone: phone,
    p_provider_message_id: messageId,
    p_contact_name: name || null,
    p_text_content: text,
    p_lock_token: lockToken,
  });

  if (beginError) {
    console.error("No se ha podido iniciar el turno del chatbot", beginError.code);
    return json({ ok: false, error: "CHATBOT_STATE_FAILED" }, 500);
  }

  const begin = (beginData || {}) as BeginTurnResult;
  if (begin.status === "duplicate") {
    return json({
      ok: true,
      duplicate: true,
      suppressDelivery: true,
      originalResponse: begin.response || null,
    });
  }
  if (begin.status === "busy") {
    return json({ ok: false, error: "CHATBOT_BUSY", retryAfterMs: 1500 }, 409);
  }
  if (begin.status !== "acquired") {
    return json({ ok: false, error: "CHATBOT_STATE_FAILED" }, 500);
  }

  try {
    const savedState = begin.state || "";
    const result = await runChatbotTurn({
      state: isChatbotState(savedState) ? savedState : "idle",
      draft: begin.draft && typeof begin.draft === "object" ? begin.draft : {},
      text,
      phone,
      contactName: begin.contactName || name,
      mode,
      restaurant: {
        id: restaurantId,
        name: web?.nombre_publico || restaurant.nombre,
        slug: web?.slug || restaurant.slug || "",
        timezone: booking?.zona_horaria || "Europe/Madrid",
        bookingEnabled: booking?.activo === true && (legalReady || mode === "pilot"),
        minParty: booking?.personas_minimas || 1,
        maxParty: booking?.personas_maximas || 12,
        maxAdvanceDays: booking?.dias_maximos_antelacion || 60,
        requiresEmail: booking?.requiere_email === true,
        address: web?.direccion_publica || restaurant.direccion || "",
        mapsUrl: web?.google_maps_url || "",
        menuUrl,
        hoursLunch: restaurant.horario_comida || "",
        hoursDinner: restaurant.horario_cena || "",
        privacyUrl: `${publicBase}/legal/privacidad`,
        bookingTermsUrl: `${publicBase}/legal/condiciones-reserva`,
      },
      dependencies: {
        getAvailability: async (date, party, excludeReservationId) => {
          const { data, error } = await supabase.rpc("obtener_disponibilidad_chatbot", {
            p_restaurante_id: restaurantId,
            p_fecha: date,
            p_personas: party,
            p_excluir_reserva_id: excludeReservationId || null,
          });
          if (error) throw new Error(rpcMessage(error));
          return ((data || []) as Array<{ inicio_at: string; hora_local: string }>).map(
            (slot): ChatbotSlot => ({ start: slot.inicio_at, time: slot.hora_local }),
          );
        },
        createBooking: async (input) => {
          const { data, error } = await supabase.rpc("crear_reserva_chatbot", {
            p_restaurante_id: restaurantId,
            p_inicio_at: input.start,
            p_personas: input.party,
            p_nombre: input.name,
            p_telefono: input.phone,
            p_email: input.email || null,
            p_idempotency_key: input.idempotencyKey,
            p_privacidad_informada: true,
            p_condiciones_aceptadas: true,
            p_version_legal: BOOKING_LEGAL_VERSION,
          });
          if (error) throw new Error(rpcMessage(error));
          const created = data as BookingResult | null;
          if (!created?.ok || !created.reserva_id || !created.inicio_at || !created.gestion_token) {
            throw new Error("BOOKING_FAILED");
          }
          return {
            reservationId: created.reserva_id,
            start: created.inicio_at,
            managementPath: `${siteUrl}/reserva/${created.gestion_token}`,
          };
        },
        listUpcomingReservations: async () => {
          const { data, error } = await supabase.rpc("obtener_reservas_chatbot_telefono", {
            p_restaurante_id: restaurantId,
            p_contact_phone: phone,
          });
          if (error) throw new Error(rpcMessage(error));
          return ((data || []) as Array<{
            reserva_id: string;
            nombre_cliente: string | null;
            personas: number | null;
            inicio_at: string;
            gestion_token: string;
          }>).map(
            (reservation): ChatbotReservation => ({
              id: reservation.reserva_id,
              managementToken: reservation.gestion_token,
              name: reservation.nombre_cliente || "",
              party: reservation.personas || 1,
              start: reservation.inicio_at,
            }),
          );
        },
        cancelReservation: async (managementToken) => {
          const { data, error } = await supabase.rpc("cancelar_reserva_publica_gestion", {
            p_gestion_token: managementToken,
          });
          if (error) throw new Error(rpcMessage(error));
          if (!(data as { ok?: boolean } | null)?.ok) throw new Error("CANCELLATION_FAILED");
        },
        rescheduleReservation: async (managementToken, start) => {
          const { data, error } = await supabase.rpc("reprogramar_reserva_publica_gestion", {
            p_gestion_token: managementToken,
            p_nuevo_inicio_at: start,
          });
          if (error) throw new Error(rpcMessage(error));
          if (!(data as { ok?: boolean } | null)?.ok) throw new Error("RESCHEDULE_FAILED");
        },
      },
    });

    const response = {
      ok: true,
      reply: result.reply,
      handoff: result.handoff,
      action: result.action || null,
      suppressDelivery: mode === "test" || result.suppressDelivery === true,
      mode,
    };
    const { data: completed, error: completeError } = await supabase.rpc("complete_chatbot_turn", {
      p_restaurante_id: restaurantId,
      p_provider_message_id: messageId,
      p_lock_token: lockToken,
      p_state: result.state,
      p_draft: result.draft,
      p_selected_reservation_id: result.selectedReservationId,
      p_handoff: result.handoff,
      p_response: response,
    });
    if (completeError || completed !== true) {
      console.error("No se ha podido cerrar el turno del chatbot", completeError?.code);
      return json({ ok: false, error: "CHATBOT_STATE_FAILED" }, 500);
    }
    return json(response);
  } catch (error) {
    const errorCode = rpcMessage(error).slice(0, 100);
    console.error("Error procesando el chatbot", errorCode);
    await supabase.rpc("fail_chatbot_turn", {
      p_restaurante_id: restaurantId,
      p_provider_message_id: messageId,
      p_lock_token: lockToken,
      p_error_code: errorCode,
    });
    return json({ ok: false, error: "CHATBOT_FAILED", retryable: true }, 500);
  }
}
