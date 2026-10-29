import type { SupabaseClient } from "@supabase/supabase-js";

export const NEW_TALGO_RESTAURANT_ID = "408f0cff-68a0-40a7-b975-d2ed8e2dbfcc";
export const NEW_TALGO_TEST_EVENTS = [
  "automation.test",
  "reservation.created",
  "reservation.rescheduled",
  "reservation.cancelled",
  "reservation.reminder",
  "reservation.status_changed",
] as const;

type AutomationConfig = {
  enabled: boolean;
  delivery_mode: string;
  max_attempts: number;
};

export type NewTalgoQueueEvent = {
  event_id: string;
  event_type: string;
  reservation_id: string | null;
  restaurante_id: string;
  cliente_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  channel: string;
  delivery_mode: "test";
  status: "pending" | "retrying" | "processing";
  scheduled_for: string;
  next_attempt_at: string | null;
  locked_at: string | null;
  lock_token: string | null;
};

export type NewTalgoClaimStore = {
  config(): Promise<AutomationConfig | null>;
  candidates(limit: number, now: string): Promise<NewTalgoQueueEvent[]>;
  claim(event: NewTalgoQueueEvent, now: string, lockToken: string): Promise<NewTalgoQueueEvent | null>;
};

function due(event: NewTalgoQueueEvent, now: Date, maxAttempts: number) {
  if (event.restaurante_id !== NEW_TALGO_RESTAURANT_ID || event.delivery_mode !== "test") return false;
  if (!NEW_TALGO_TEST_EVENTS.some((type) => type === event.event_type)) return false;
  if (!Number.isInteger(event.attempts) || event.attempts >= maxAttempts) return false;
  if (new Date(event.scheduled_for).getTime() > now.getTime()) return false;
  if (event.next_attempt_at && new Date(event.next_attempt_at).getTime() > now.getTime()) return false;
  if (event.status === "processing") {
    return Boolean(event.locked_at) &&
      new Date(event.locked_at!).getTime() < now.getTime() - 10 * 60_000;
  }
  return event.status === "pending" || event.status === "retrying";
}

// Optimistic compare-and-swap keeps concurrent preview invocations from claiming
// the same event. The tenant and test-mode predicates are repeated on the UPDATE.
export async function claimNewTalgoTestEvents(
  store: NewTalgoClaimStore,
  now = new Date(),
  requestedLimit = 10,
) {
  const config = await store.config();
  if (!config?.enabled || config.delivery_mode !== "test") return [];

  const limit = Math.max(1, Math.min(Math.trunc(requestedLimit) || 10, 10));
  const candidates = await store.candidates(limit * 4, now.toISOString());
  const claimed: NewTalgoQueueEvent[] = [];
  for (const event of candidates) {
    if (claimed.length >= limit) break;
    if (!due(event, now, config.max_attempts)) continue;
    const winner = await store.claim(event, now.toISOString(), crypto.randomUUID());
    if (winner) claimed.push(winner);
  }
  return claimed;
}

export function newTalgoSupabaseClaimStore(supabase: SupabaseClient): NewTalgoClaimStore {
  return {
    async config() {
      const { data, error } = await supabase
        .from("automatizaciones_config")
        .select("enabled,delivery_mode,max_attempts")
        .eq("restaurante_id", NEW_TALGO_RESTAURANT_ID)
        .maybeSingle<AutomationConfig>();
      if (error) throw error;
      return data;
    },
    async candidates(limit, now) {
      const { data, error } = await supabase
        .from("reservation_webhook_deliveries")
        .select("event_id,event_type,reservation_id,restaurante_id,cliente_id,payload,attempts,channel,delivery_mode,status,scheduled_for,next_attempt_at,locked_at,lock_token")
        .eq("restaurante_id", NEW_TALGO_RESTAURANT_ID)
        .eq("delivery_mode", "test")
        .in("event_type", [...NEW_TALGO_TEST_EVENTS])
        .in("status", ["pending", "retrying", "processing"])
        .lte("scheduled_for", now)
        .order("scheduled_for", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data || []) as NewTalgoQueueEvent[];
    },
    async claim(event, now, lockToken) {
      let query = supabase
        .from("reservation_webhook_deliveries")
        .update({
          status: "processing",
          attempts: event.attempts + 1,
          locked_at: now,
          lock_token: lockToken,
          last_attempt_at: now,
          updated_at: now,
        })
        .eq("event_id", event.event_id)
        .eq("restaurante_id", NEW_TALGO_RESTAURANT_ID)
        .eq("delivery_mode", "test")
        .eq("event_type", event.event_type)
        .eq("status", event.status)
        .eq("attempts", event.attempts)
        .eq("scheduled_for", event.scheduled_for);

      query = event.next_attempt_at
        ? query.eq("next_attempt_at", event.next_attempt_at)
        : query.is("next_attempt_at", null);
      query = event.locked_at
        ? query.eq("locked_at", event.locked_at)
        : query.is("locked_at", null);
      query = event.lock_token
        ? query.eq("lock_token", event.lock_token)
        : query.is("lock_token", null);

      const { data, error } = await query
        .select("event_id,event_type,reservation_id,restaurante_id,cliente_id,payload,attempts,channel,delivery_mode,status,scheduled_for,next_attempt_at,locked_at,lock_token")
        .maybeSingle<NewTalgoQueueEvent>();
      if (error) throw error;
      return data;
    },
  };
}

