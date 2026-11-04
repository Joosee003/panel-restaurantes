import type { SupabaseClient } from "@supabase/supabase-js";
// Kept in this isolated module so Node's TS test runner and Next resolve it identically.
export const NEW_TALGO_RESTAURANT_ID = "408f0cff-68a0-40a7-b975-d2ed8e2dbfcc";

export const NEW_TALGO_LIVE_EVENTS = [
  "reservation.created",
  "reservation.rescheduled",
  "reservation.cancelled",
  "reservation.status_changed",
] as const;

export type NewTalgoLiveEvent = {
  event_id: string;
  event_type: string;
  reservation_id: string | null;
  restaurante_id: string;
  cliente_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  channel: string;
  delivery_mode: string;
  status: string;
  scheduled_for: string;
  next_attempt_at: string | null;
  locked_at: string | null;
  lock_token: string | null;
};

const FIELDS = "event_id,event_type,reservation_id,restaurante_id,cliente_id,payload,attempts,channel,delivery_mode,status,scheduled_for,next_attempt_at,locked_at,lock_token";

export function isDueNewTalgoLiveEvent(event: NewTalgoLiveEvent, now: Date, maxAttempts: number) {
  if (event.restaurante_id !== NEW_TALGO_RESTAURANT_ID || event.delivery_mode !== "live") return false;
  if (!NEW_TALGO_LIVE_EVENTS.some((type) => type === event.event_type)) return false;
  if (!Number.isInteger(event.attempts) || event.attempts >= maxAttempts) return false;
  if (new Date(event.scheduled_for).getTime() > now.getTime()) return false;
  if (event.next_attempt_at && new Date(event.next_attempt_at).getTime() > now.getTime()) return false;
  if (event.status === "processing") {
    return Boolean(event.locked_at) && new Date(event.locked_at!).getTime() < now.getTime() - 10 * 60_000;
  }
  return event.status === "pending" || event.status === "retrying";
}

export async function claimNewTalgoLiveEvents(supabase: SupabaseClient, now = new Date(), requestedLimit = 3) {
  const [configResult, moduleResult] = await Promise.all([
    supabase.from("automatizaciones_config")
      .select("enabled,delivery_mode,email_enabled,max_attempts")
      .eq("restaurante_id", NEW_TALGO_RESTAURANT_ID).maybeSingle(),
    supabase.from("restaurante_modulos")
      .select("automatizaciones")
      .eq("restaurante_id", NEW_TALGO_RESTAURANT_ID).maybeSingle(),
  ]);
  if (configResult.error) throw configResult.error;
  if (moduleResult.error) throw moduleResult.error;
  const config = configResult.data;
  if (!config?.enabled || config.delivery_mode !== "live" || !config.email_enabled ||
      moduleResult.data?.automatizaciones !== true) return [];

  const limit = Math.max(1, Math.min(Math.trunc(requestedLimit) || 3, 3));
  const { data, error } = await supabase.from("reservation_webhook_deliveries")
    .select(FIELDS)
    .eq("restaurante_id", NEW_TALGO_RESTAURANT_ID)
    .eq("delivery_mode", "live")
    .in("event_type", [...NEW_TALGO_LIVE_EVENTS])
    .in("status", ["pending", "retrying", "processing"])
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(limit * 4);
  if (error) throw error;

  const claimed: NewTalgoLiveEvent[] = [];
  for (const event of (data || []) as NewTalgoLiveEvent[]) {
    if (claimed.length >= limit) break;
    if (!isDueNewTalgoLiveEvent(event, now, config.max_attempts)) continue;
    const lockToken = crypto.randomUUID();
    let query = supabase.from("reservation_webhook_deliveries")
      .update({ status: "processing", attempts: event.attempts + 1,
        locked_at: now.toISOString(), lock_token: lockToken,
        last_attempt_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("event_id", event.event_id)
      .eq("restaurante_id", NEW_TALGO_RESTAURANT_ID)
      .eq("delivery_mode", "live")
      .eq("event_type", event.event_type)
      .eq("status", event.status)
      .eq("attempts", event.attempts)
      .eq("scheduled_for", event.scheduled_for);
    query = event.next_attempt_at ? query.eq("next_attempt_at", event.next_attempt_at) : query.is("next_attempt_at", null);
    query = event.locked_at ? query.eq("locked_at", event.locked_at) : query.is("locked_at", null);
    query = event.lock_token ? query.eq("lock_token", event.lock_token) : query.is("lock_token", null);
    const result = await query.select(FIELDS).maybeSingle<NewTalgoLiveEvent>();
    if (result.error) throw result.error;
    if (result.data) claimed.push(result.data);
  }
  return claimed;
}

