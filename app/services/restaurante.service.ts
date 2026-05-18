import { supabase } from "../(app)/lib/supabaseClient";
import { getRestauranteUsuario } from "../(app)/lib/getRestauranteUsuario";
import { throwSupabaseError } from "./supabaseError";

export async function getSessionUser() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throwSupabaseError(error, "No se pudo comprobar la sesión.");
  }

  return data.session?.user ?? null;
}

export async function getRestauranteById(restauranteId: string) {
  const { data, error } = await supabase
    .from("restaurantes")
    .select("*")
    .eq("id", restauranteId)
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, "No se pudo cargar el restaurante.");
  }

  return data;
}

export async function getCurrentRestaurante() {
  const user = await getSessionUser();

  if (!user) {
    return null;
  }

  const restauranteId = await getRestauranteUsuario();

  if (!restauranteId) {
    return null;
  }

  return getRestauranteById(restauranteId);
}