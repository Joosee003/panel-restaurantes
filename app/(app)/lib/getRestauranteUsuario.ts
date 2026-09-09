import { supabase } from "./supabaseClient";
import { getActiveRestaurant, setActiveRestaurant } from "./activeRestaurant";

export async function getRestauranteUsuario(): Promise<string | null> {
  const seleccionado = getActiveRestaurant();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || getActiveRestaurant() !== seleccionado) return null;

  const stillCurrent = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id === user.id && getActiveRestaurant() === seleccionado;
  };

  if (seleccionado) {
    const { data: puedeAcceder, error: accesoError } = await supabase.rpc(
      "puede_acceder_restaurante",
      { p_restaurante_id: seleccionado },
    );

    // Never let a delayed check put the previous restaurant back on screen.
    if (!(await stillCurrent())) return null;
    if (accesoError) throw accesoError;
    if (puedeAcceder === true) {
      return seleccionado;
    }

    setActiveRestaurant(null);
    return null;
  }

  const { data, error } = await supabase
    .from("usuarios_restaurantes")
    .select("restaurante_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.restaurante_id) return null;

  if (!(await stillCurrent())) return null;
  setActiveRestaurant(data.restaurante_id);

  return data.restaurante_id;
}
