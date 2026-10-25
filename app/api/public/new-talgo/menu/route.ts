import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type RecordValue = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function menuPhoto(value: unknown, supabaseUrl: string): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    const expected = new URL(supabaseUrl);
    if (url.origin !== expected.origin || !url.pathname.startsWith("/storage/v1/object/public/menus/")) return null;
    return url.href;
  } catch {
    return null;
  }
}

// The original obtener_carta_publica RPC decides which menu, categories and
// products are published. This projection exposes only the fields this site
// needs and fails closed for incomplete products or another restaurant.
export function projectNewTalgoMenu(payload: unknown, restaurantId: string, supabaseUrl: string, allowDraft = false) {
  if (!payload || typeof payload !== "object") return null;
  const source = payload as RecordValue;
  const carta = source.carta as RecordValue | undefined;
  if (!carta || carta.restaurante_id !== restaurantId || (carta.estado !== "activa" && !(allowDraft && carta.estado === "borrador"))) return null;
  const categories = (Array.isArray(source.categorias) ? source.categorias : [])
    .filter((value): value is RecordValue => !!value && typeof value === "object")
    .filter((value) => value.restaurante_id === restaurantId && value.carta_id === carta.id && value.activa === true && text(value.nombre))
    .map((value) => ({ id: text(value.id), nombre: text(value.nombre) }));
  const ids = new Set(categories.map((category) => category.id));
  const products = (Array.isArray(source.productos) ? source.productos : [])
    .filter((value): value is RecordValue => !!value && typeof value === "object")
    .filter((value) => value.restaurante_id === restaurantId && value.carta_id === carta.id && value.activo === true
      && ids.has(text(value.categoria_id)) && text(value.nombre) && value.precio !== null && value.precio !== undefined
      && Number.isFinite(Number(value.precio)) && Number(value.precio) >= 0)
    .map((value) => ({
      id: text(value.id), categoriaId: text(value.categoria_id), nombre: text(value.nombre),
      descripcion: text(value.descripcion) || null, precio: Number(value.precio),
      imagenUrl: menuPhoto(value.imagen_url, supabaseUrl),
      alergenos: Array.isArray(value.alergenos) ? value.alergenos.filter((item): item is string => typeof item === "string" && !!item.trim()) : [],
    }));
  return { nombre: text(carta.nombre), categorias: categories.filter((category) => products.some((product) => product.categoriaId === category.id)), productos: products };
}

export async function GET() {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" };
  const token = process.env.NEW_TALGO_PUBLIC_MENU_TOKEN?.trim();
  const restaurantId = process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !/^[a-zA-Z0-9]{32}$/.test(token) || !restaurantId || !url || !anonKey) {
    return Response.json({ status: "pendiente", categorias: [], productos: [] }, { headers });
  }
  try {
    const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.rpc("obtener_carta_publica", { p_public_token: token });
    if (error) throw error;
    const menu = projectNewTalgoMenu(data, restaurantId, url);
    return Response.json(menu ? { status: "publicada", ...menu } : { status: "pendiente", categorias: [], productos: [] }, { headers });
  } catch {
    return Response.json({ status: "error", categorias: [], productos: [] }, { status: 503, headers });
  }
}
