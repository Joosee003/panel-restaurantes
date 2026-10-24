import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const headers = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow, noarchive" };
const locations = new Set(["universitarios", "partidas", "estacion"]);
const types = new Set(["precio_especial", "porcentaje", "descuento_fijo", "grupos", "dos_por_uno", "pack", "evento"]);
const targets = new Set(["carta", "visitanos", "contacto"]);

function string(value: unknown, max = 700) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function money(value: unknown) {
  return value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) > 0
    ? Number(value) : null;
}

function image(value: unknown, supabaseUrl: string, restaurantId: string) {
  const raw = string(value, 500);
  if (/^\/new-talgo\/assets\/photos\/[a-z0-9-]+\.webp$/i.test(raw)) return raw;
  try {
    const actual = new URL(raw);
    const expected = new URL(supabaseUrl);
    if (actual.origin === expected.origin && actual.pathname.startsWith(`/storage/v1/object/public/menus/productos/${restaurantId}/`)) return actual.href;
  } catch { /* Invalid or absent image: omit it. */ }
  return null;
}

export function projectPromotions(payload: unknown, supabaseUrl: string, restaurantId: string) {
  if (!Array.isArray(payload)) return [];
  return payload.filter((item): item is Row => !!item && typeof item === "object")
    .filter(item => locations.has(string(item.ubicacion)) && types.has(string(item.tipo)) && string(item.titulo))
    .map(item => ({
      id: string(item.id, 40), ubicacion: string(item.ubicacion, 24), tipo: string(item.tipo, 24),
      titulo: string(item.titulo, 90), descripcion: string(item.descripcion), publico: string(item.publico, 120),
      productos: string(item.productos, 300), precio: money(item.precio),
      descuentoPorcentaje: money(item.descuento_porcentaje), descuentoEuros: money(item.descuento_eur),
      personasMinimas: Number.isInteger(Number(item.personas_minimas)) && Number(item.personas_minimas) >= 2 ? Number(item.personas_minimas) : null,
      imagenUrl: image(item.imagen_url, supabaseUrl, restaurantId), condiciones: string(item.condiciones, 500),
      boton: string(item.cta_texto, 45) || "Ver carta",
      destino: targets.has(string(item.cta_destino)) ? string(item.cta_destino) : "carta",
    }));
}

export async function GET() {
  const restaurantId = process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!restaurantId || !url || !key) return Response.json({ promociones: [] }, { headers });
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.rpc("obtener_promociones_publicas", { p_restaurante_id: restaurantId });
    if (error) throw error;
    return Response.json({ promociones: projectPromotions(data, url, restaurantId) }, { headers });
  } catch {
    return Response.json({ promociones: [] }, { status: 503, headers });
  }
}
