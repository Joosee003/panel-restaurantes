import { supabase } from "./supabaseClient";

const STORAGE_KEY = "gastrohelp_restaurante_activo";

export async function getRestauranteUsuario(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const seleccionado =
    typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;

  if (seleccionado) {
    const { data: puedeAcceder, error: accesoError } = await supabase.rpc(
      "puede_acceder_restaurante",
      { p_restaurante_id: seleccionado },
    );

    if (!accesoError && puedeAcceder === true) {
      return seleccionado;
    }

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  const { data, error } = await supabase
    .from("usuarios_restaurantes")
    .select("restaurante_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.restaurante_id) return null;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, data.restaurante_id);
  }

  return data.restaurante_id;
}
