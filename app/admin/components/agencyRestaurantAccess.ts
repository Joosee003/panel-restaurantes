import type { SupabaseClient } from "@supabase/supabase-js";
import { setActiveRestaurant } from "@/app/(app)/lib/activeRestaurant";

export type AgencyRestaurant = { userId: string; id: string; name: string };
let selectionRevision = 0;
export class AgencyAccessError extends Error {
  constructor(public readonly code: string) { super(code); }
}

// The server-validated user and protected app_admins table are authoritative.
// Neither browser storage nor user_metadata grants the agency privilege.
export async function readAgencyIdentity(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new AgencyAccessError("INVALID_SESSION");
  const access = await client.from("app_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (access.error) throw new AgencyAccessError("ACCESS_CHECK_FAILED");
  return { userId: data.user.id, isAgency: access.data?.user_id === data.user.id };
}

export async function resolveAgencyRestaurant(client: SupabaseClient, restaurantId: string): Promise<AgencyRestaurant> {
  const identity = await readAgencyIdentity(client);
  if (!identity.isAgency) throw new AgencyAccessError("AGENCY_REQUIRED");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId)) {
    throw new AgencyAccessError("INVALID_RESTAURANT");
  }
  const permission = await client.rpc("puede_acceder_restaurante", { p_restaurante_id: restaurantId });
  if (permission.error || permission.data !== true) throw new AgencyAccessError("ACCESS_CHECK_FAILED");
  const [restaurant, modules] = await Promise.all([
    client.from("restaurantes").select("id,nombre").eq("id", restaurantId).maybeSingle(),
    client.from("restaurante_modulos").select("estado").eq("restaurante_id", restaurantId).maybeSingle(),
  ]);
  if (restaurant.error || modules.error) throw new AgencyAccessError("ACCESS_CHECK_FAILED");
  if (!restaurant.data || restaurant.data.id !== restaurantId) throw new AgencyAccessError("RESTAURANT_NOT_FOUND");
  if (!modules.data || !["activo", "demo"].includes(modules.data.estado)) throw new AgencyAccessError("RESTAURANT_INACTIVE");
  const current = await client.auth.getSession();
  if (current.error || current.data.session?.user.id !== identity.userId) throw new AgencyAccessError("STALE_SESSION");
  return { userId: identity.userId, id: restaurantId, name: restaurant.data.nombre || "Restaurante" };
}

export async function enterAgencyRestaurant(client: SupabaseClient, restaurantId: string, signal?: AbortSignal) {
  // A remembered selection is only a request. Validate before committing it.
  const revision = ++selectionRevision;
  const context = await resolveAgencyRestaurant(client, restaurantId);
  if (signal?.aborted || revision !== selectionRevision) throw new AgencyAccessError("STALE_SESSION");
  setActiveRestaurant(context.id);
  return context;
}

export function returnToAgency() { selectionRevision++; setActiveRestaurant(null); }

export function agencyAccessMessage(error: unknown) {
  const code = error instanceof AgencyAccessError ? error.code : "ACCESS_CHECK_FAILED";
  const messages: Record<string, string> = {
    INVALID_SESSION: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
    AGENCY_REQUIRED: "Este acceso está reservado a una cuenta de agencia.",
    INVALID_RESTAURANT: "Selecciona un restaurante desde el control de agencia.",
    RESTAURANT_NOT_FOUND: "El restaurante ya no existe o no está disponible.",
    RESTAURANT_INACTIVE: "El restaurante no tiene el panel activo. Revisa su estado desde agencia.",
    STALE_SESSION: "La sesión ha cambiado. Vuelve al control de agencia.",
    ACCESS_CHECK_FAILED: "No se ha podido verificar el acceso. No se ha abierto el restaurante.",
  };
  return messages[code] || messages.ACCESS_CHECK_FAILED;
}
