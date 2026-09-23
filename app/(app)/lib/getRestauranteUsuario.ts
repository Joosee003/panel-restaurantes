import { supabase } from "./supabaseClient";
import { getActiveRestaurant, setActiveRestaurant } from "./activeRestaurant";

type RestaurantCache = {
  key: string;
  value: string | null;
};

let cache: RestaurantCache | null = null;
let pending: { key: string; promise: Promise<string | null> } | null = null;

function cacheKey(userId: string, selected: string | null) {
  return `${userId}:${selected ?? ""}`;
}

async function sameUser(userId: string) {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id === userId;
}

export async function getRestauranteUsuario(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const user = session?.user;
  if (!user) return null;

  const selected = getActiveRestaurant();
  const key = cacheKey(user.id, selected);

  if (cache?.key === key) return cache.value;
  if (pending?.key === key) return pending.promise;

  const promise = (async () => {
    let expectedSelection = selected;

    if (selected) {
      const { data: puedeAcceder, error: accesoError } = await supabase.rpc(
        "puede_acceder_restaurante",
        { p_restaurante_id: selected },
      );

      if (!(await sameUser(user.id)) || getActiveRestaurant() !== expectedSelection) {
        return null;
      }
      if (accesoError) throw accesoError;
      if (puedeAcceder === true) {
        cache = { key, value: selected };
        return selected;
      }

      setActiveRestaurant(null);
      expectedSelection = null;
    }

    const { data, error } = await supabase
      .from("usuarios_restaurantes")
      .select("restaurante_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data?.restaurante_id) return null;
    if (!(await sameUser(user.id)) || getActiveRestaurant() !== expectedSelection) {
      return null;
    }

    const restauranteId = String(data.restaurante_id);
    setActiveRestaurant(restauranteId);
    cache = { key: cacheKey(user.id, restauranteId), value: restauranteId };
    return restauranteId;
  })();

  pending = { key, promise };

  try {
    return await promise;
  } finally {
    if (pending?.promise === promise) pending = null;
  }
}
