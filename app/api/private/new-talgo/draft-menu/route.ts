import { createClient } from "@supabase/supabase-js";
import { projectNewTalgoMenu } from "@/app/api/public/new-talgo/menu/route";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Vary": "Host",
};

// Vercel Authentication covers deployment URLs. Custom domains are explicitly
// excluded from that protection, so the draft route accepts only its exact URL.
export function draftPreviewAllowed(request: Request, environment: NodeJS.ProcessEnv = process.env) {
  const deploymentHost = environment.VERCEL_URL?.toLowerCase();
  const requestHost = request.headers.get("host")?.toLowerCase();
  const restaurantId = environment.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID;
  const projectRef = environment.GASTROHELP_APPROVED_PROJECT_REF;
  let supabaseHost = "";
  try { supabaseHost = new URL(environment.NEXT_PUBLIC_SUPABASE_URL || "").hostname; } catch { return false; }
  return environment.GASTROHELP_DEPLOYMENT_MODE === "restricted-preview"
    && environment.VERCEL_ENV === "preview"
    && environment.VERCEL_GIT_COMMIT_REF === "codex/new-talgo-on-production"
    && !!deploymentHost && /^[a-z0-9-]+\.vercel\.app$/.test(deploymentHost)
    && requestHost === deploymentHost
    && new URL(request.url).hostname.toLowerCase() === deploymentHost
    && projectRef === "yyiotkszobortppwiqal"
    && supabaseHost === `${projectRef}.supabase.co`
    && restaurantId === "408f0cff-68a0-40a7-b975-d2ed8e2dbfcc";
}

export async function GET(request: Request) {
  if (!draftPreviewAllowed(request)) return Response.json({ error: "NOT_FOUND" }, { status: 404, headers });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const restaurantId = process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID;
  if (!url || !restaurantId || (!key && !anonKey)) return Response.json({ error: "UNAVAILABLE" }, { status: 503, headers });

  try {
    // The isolated Preview reads through the viewer's JWT and the existing
    // restaurant RLS policies. It does not need a production service key.
    const bearer = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9._-]{100,5000})$/)?.[1];
    if (!key && !bearer) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401, headers });
    const client = key
      ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      : createClient(url!, anonKey!, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${bearer}` } },
        });
    if (!key) {
      const { data: identity, error: identityError } = await client.auth.getUser(bearer);
      if (identityError || !identity.user) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401, headers });
      const { data: canAccess, error: accessError } = await client.rpc("puede_acceder_restaurante", { p_restaurante_id: restaurantId });
      if (accessError || canAccess !== true) return Response.json({ error: "NOT_FOUND" }, { status: 404, headers });
    }
    const { data: carta, error: cartaError } = await client.from("cartas_digitales")
      .select("id,restaurante_id,nombre,estado,created_at")
      .eq("restaurante_id", restaurantId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (cartaError) throw cartaError;
    if (!carta || carta.estado !== "borrador") return Response.json({ error: "NOT_FOUND" }, { status: 404, headers });

    const [categories, products] = await Promise.all([
      client.from("carta_categorias")
        .select("id,restaurante_id,carta_id,nombre,activa,orden")
        .eq("restaurante_id", restaurantId).eq("carta_id", carta.id).eq("activa", true).order("orden"),
      client.from("carta_productos")
        .select("id,restaurante_id,carta_id,categoria_id,nombre,descripcion,precio,imagen_url,alergenos,activo,orden")
        .eq("restaurante_id", restaurantId).eq("carta_id", carta.id).eq("activo", true).order("orden"),
    ]);
    if (categories.error) throw categories.error;
    if (products.error) throw products.error;
    const menu = projectNewTalgoMenu({ carta, categorias: categories.data, productos: products.data }, restaurantId, url, true);
    if (!menu) return Response.json({ error: "UNAVAILABLE" }, { status: 503, headers });
    return Response.json({ status: "vista_previa", ...menu }, { headers });
  } catch {
    return Response.json({ error: "UNAVAILABLE" }, { status: 503, headers });
  }
}
