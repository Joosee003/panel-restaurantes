import { NextRequest, NextResponse } from "next/server";
import { getOpinionesServerClient } from "@/lib/opiniones/supabase";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ORIGINS = new Set([
  "mesa",
  "caja",
  "entrada",
  "portacuentas",
  "redes",
  "desconocido",
]);
const ALLOWED_ASPECTS = new Set([
  "comida",
  "servicio",
  "ambiente",
  "espera",
  "limpieza",
  "calidad_precio",
]);

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function cleanAspects(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.toLowerCase().trim())
        .filter((item) => ALLOWED_ASPECTS.has(item)),
    ),
  ).slice(0, 6);
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const normalizedSlug = slug.toLowerCase().trim();

    if (!SLUG_PATTERN.test(normalizedSlug)) {
      return NextResponse.json({ error: "Enlace no válido." }, { status: 400 });
    }

    const supabase = getOpinionesServerClient();
    const { data, error } = await supabase.rpc("get_opinion_public_config_v2", {
      p_slug: normalizedSlug,
    });

    if (error) {
      console.error("get_opinion_public_config_v2", error);
      return NextResponse.json(
        { error: "No se pudo cargar el sistema de opiniones." },
        { status: 500 },
      );
    }

    const config = Array.isArray(data) ? data[0] : null;
    if (!config) {
      return NextResponse.json(
        { error: "Este sistema de opiniones no está disponible." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { config },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("GET /api/opiniones/[slug]", error);
    return NextResponse.json(
      { error: "No se pudo cargar el sistema de opiniones." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const normalizedSlug = slug.toLowerCase().trim();

    if (!SLUG_PATTERN.test(normalizedSlug)) {
      return NextResponse.json({ error: "Enlace no válido." }, { status: 400 });
    }

    const body = (await request.json()) as Record<string, unknown>;

    // Campo trampa para bots. Debe permanecer vacío en la interfaz real.
    if (typeof body.website === "string" && body.website.trim()) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Selecciona una valoración del 1 al 5." },
        { status: 400 },
      );
    }

    const consentimiento = body.consentimiento === true;
    if (!consentimiento) {
      return NextResponse.json(
        { error: "Debes aceptar el aviso de privacidad." },
        { status: 400 },
      );
    }

    const comentario = cleanText(body.comentario, 2000);
    const nombreCliente = cleanText(body.nombreCliente, 100);
    const aspectos = cleanAspects(body.aspectos);
    const solicitaContacto = body.solicitaContacto === true;
    const contacto = solicitaContacto ? cleanText(body.contacto, 160) : null;
    const contactoTipoRaw =
      typeof body.contactoTipo === "string"
        ? body.contactoTipo.toLowerCase().trim()
        : "ninguno";
    const contactoTipo =
      solicitaContacto &&
      (contactoTipoRaw === "telefono" || contactoTipoRaw === "email")
        ? contactoTipoRaw
        : "ninguno";

    if (solicitaContacto && !contacto) {
      return NextResponse.json(
        { error: "Añade un teléfono o correo para que puedan contactarte." },
        { status: 400 },
      );
    }

    const origenRaw =
      typeof body.origen === "string" ? body.origen.toLowerCase().trim() : "";
    const origen = ALLOWED_ORIGINS.has(origenRaw)
      ? origenRaw
      : "desconocido";

    const submissionToken =
      typeof body.submissionToken === "string" &&
      UUID_PATTERN.test(body.submissionToken)
        ? body.submissionToken
        : crypto.randomUUID();

    const supabase = getOpinionesServerClient();
    const { data, error } = await supabase.rpc("submit_opinion_qr_v2", {
      p_slug: normalizedSlug,
      p_rating: rating,
      p_comentario: comentario,
      p_nombre_cliente: nombreCliente,
      p_origen: origen,
      p_submission_token: submissionToken,
      p_consentimiento_privacidad: consentimiento,
      p_aspectos: aspectos,
      p_contacto: contacto,
      p_contacto_tipo: contactoTipo,
      p_solicita_contacto: solicitaContacto,
    });

    if (error) {
      console.error("submit_opinion_qr_v2", error);
      return NextResponse.json(
        { error: "No se pudo enviar tu opinión. Inténtalo de nuevo." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: true, opinionId: data },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("POST /api/opiniones/[slug]", error);
    return NextResponse.json(
      { error: "No se pudo enviar tu opinión. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}
