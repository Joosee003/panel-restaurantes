import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Server-only persistence; none of these tables grant browser access. */
export type WahaChannelStatus = "STOPPED" | "STARTING" | "SCAN_QR_CODE" | "WORKING" | "FAILED"
  | "PASSKEY_REQUIRED" | "PASSKEY_CONFIRMATION_REQUIRED" | "CAPPED" | "NUMBER_MISMATCH" | "UNAVAILABLE";
export type WahaChannel = {
  id: string; restaurante_id: string; session_name: string; phone_e164: string | null;
  status: WahaChannelStatus; enabled: boolean; chatbot_enabled: boolean; reviews_enabled: boolean;
  generation: number; revision: number; activated_at: string | null; created_at: string; updated_at: string;
};
export type WahaChannelPatch = Partial<Pick<WahaChannel,
  "phone_e164" | "status" | "enabled" | "chatbot_enabled" | "reviews_enabled">>;
export type WahaMessageStatus = "processing" | "ready" | "sending" | "sent" | "completed" | "failed" | "uncertain" | "suppressed";
export type WahaMessage = {
  id: string; channel_id: string; channel_generation: number; channel_phone_e164: string;
  provider_message_id: string; direction: "inbound" | "outbound"; purpose: "chatbot" | "review";
  contact_phone: string; chat_id: string; message_at: string; contact_name: string | null;
  text_content: string | null; engine_response: Record<string, unknown> | null;
  status: WahaMessageStatus; lock_token: string | null; locked_until: string | null;
  reserved_outgoing_id: string | null; outgoing_message_id: string | null;
  ack: number; ack_updated_at: string | null; attempts: number; last_error: string | null;
  created_at: string; updated_at: string;
};
export type WahaMessageClaimInput = {
  channelId: string; generation: number; phoneE164: string; messageId: string;
  direction: "inbound" | "outbound"; purpose?: "chatbot" | "review";
  contactPhone: string; chatId: string; messageAt: string; lockToken?: string;
  text?: string; name?: string; textContent?: string; contactName?: string;
};
export type WahaMessageClaim = {
  status: "acquired" | "busy" | "duplicate" | "stale" | "blocked";
  message?: WahaMessage; lockToken: string; reason?: string;
};
export type WahaContact = {
  channel_id: string; contact_phone: string; paused: boolean; paused_at: string | null;
  pause_reason: string | null; last_message_at: string | null; updated_at: string;
  resumed_at: string | null; last_human_message_at: string | null;
};

const channelFields = "id,restaurante_id,session_name,phone_e164,status,enabled,chatbot_enabled,reviews_enabled,generation,revision,activated_at,created_at,updated_at";

function checkError(error: { code?: string } | null, operation: string): void {
  // Database messages can contain customer data; expose only a bounded operation code.
  if (error) throw new Error(`${operation}:${error.code || "DATABASE_ERROR"}`);
}

async function rpc<T>(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  checkError(error, name);
  return data as T;
}

export async function getWahaChannelForRestaurant(db: SupabaseClient, restaurantId: string): Promise<WahaChannel | null> {
  const { data, error } = await db.from("whatsapp_channels").select(channelFields).eq("restaurante_id", restaurantId).maybeSingle<WahaChannel>();
  checkError(error, "CHANNEL_READ_FAILED");
  return data;
}

export async function getWahaChannelBySession(db: SupabaseClient, session: string): Promise<WahaChannel | null> {
  if (!/^gh_[a-f0-9]{32}$/.test(session)) return null;
  const { data, error } = await db.from("whatsapp_channels").select(channelFields).eq("session_name", session).maybeSingle<WahaChannel>();
  checkError(error, "CHANNEL_READ_FAILED");
  return data;
}

export async function getWahaChannelById(db: SupabaseClient, id: string): Promise<WahaChannel | null> {
  const { data, error } = await db.from("whatsapp_channels").select(channelFields).eq("id", id).maybeSingle<WahaChannel>();
  checkError(error, "CHANNEL_READ_FAILED");
  return data;
}

export async function createWahaChannel(db: SupabaseClient, restaurantId: string): Promise<WahaChannel> {
  const existing = await getWahaChannelForRestaurant(db, restaurantId);
  if (existing) return existing;
  const id = randomUUID();
  const { data, error } = await db.from("whatsapp_channels")
    .insert({ id, restaurante_id: restaurantId, session_name: `gh_${id.replaceAll("-", "")}` })
    .select(channelFields).single<WahaChannel>();
  if (error?.code === "23505") {
    const raced = await getWahaChannelForRestaurant(db, restaurantId);
    if (raced) return raced;
  }
  checkError(error, "CHANNEL_CREATE_FAILED");
  if (!data) throw new Error("CHANNEL_CREATE_FAILED");
  return data;
}

/** generation protects routing/send ownership; revision also protects status-poll races. */
export async function updateWahaChannel(db: SupabaseClient, id: string, patch: WahaChannelPatch,
  expectedGeneration?: number, expectedRevision?: number): Promise<WahaChannel | null> {
  const allowed = new Set(["phone_e164", "status", "enabled", "chatbot_enabled", "reviews_enabled"]);
  if (!Object.keys(patch).length || Object.keys(patch).some(key => !allowed.has(key))) throw new Error("INVALID_CHANNEL_PATCH");
  let query = db.from("whatsapp_channels").update(patch).eq("id", id);
  if (expectedGeneration !== undefined) query = query.eq("generation", expectedGeneration);
  if (expectedRevision !== undefined) query = query.eq("revision", expectedRevision);
  const { data, error } = await query.select(channelFields).maybeSingle<WahaChannel>();
  checkError(error, "CHANNEL_UPDATE_FAILED");
  return data;
}

export async function claimWahaMessage(db: SupabaseClient, input: WahaMessageClaimInput): Promise<WahaMessageClaim> {
  const lockToken = input.lockToken || randomUUID();
  const result = await rpc<Omit<WahaMessageClaim, "lockToken"> & { lockToken?: string }>(db, "claim_whatsapp_channel_message", {
    p_channel_id: input.channelId, p_generation: input.generation, p_phone_e164: input.phoneE164,
    p_message_id: input.messageId, p_direction: input.direction, p_purpose: input.purpose || "chatbot",
    p_contact_phone: input.contactPhone, p_chat_id: input.chatId, p_message_at: input.messageAt,
    p_lock_token: lockToken, p_text_content: input.textContent || input.text || null, p_contact_name: input.contactName || input.name || null,
  });
  return { ...result, lockToken: result.lockToken || lockToken };
}

export function stageWahaInbound(db: SupabaseClient, input: WahaMessageClaimInput): Promise<WahaMessage | null> {
  return rpc(db, "stage_whatsapp_channel_inbound", {
    p_channel_id: input.channelId, p_generation: input.generation, p_phone_e164: input.phoneE164,
    p_message_id: input.messageId, p_contact_phone: input.contactPhone, p_chat_id: input.chatId,
    p_message_at: input.messageAt, p_text_content: input.textContent || input.text || "",
    p_contact_name: input.contactName || input.name || null,
  });
}

export function cacheWahaResponse(db: SupabaseClient, id: string, lockToken: string, response: Record<string, unknown>): Promise<boolean> {
  return rpc(db, "cache_whatsapp_channel_response", { p_message_id: id, p_lock_token: lockToken, p_response: response });
}

export function beginWahaSend(db: SupabaseClient, id: string, lockToken: string): Promise<boolean> {
  return rpc(db, "begin_whatsapp_channel_send", { p_message_id: id, p_lock_token: lockToken });
}

export function reserveWahaOutgoingId(db: SupabaseClient, id: string, lockToken: string, outgoingId: string): Promise<boolean> {
  return rpc(db, "reserve_whatsapp_channel_outgoing_id", { p_message_id: id, p_lock_token: lockToken, p_outgoing_id: outgoingId });
}

export function finishWahaSend(db: SupabaseClient, id: string, lockToken: string,
  result: { outcome: "sent" | "uncertain" | "blocked"; providerMessageId?: string; error?: string }): Promise<boolean> {
  return rpc(db, "finish_whatsapp_channel_send", {
    p_message_id: id, p_lock_token: lockToken, p_outcome: result.outcome,
    p_provider_message_id: result.providerMessageId || null, p_error: result.error || null,
  });
}

export function failWahaMessage(db: SupabaseClient, id: string, lockToken: string, error: string): Promise<boolean> {
  return rpc(db, "fail_whatsapp_channel_message", { p_message_id: id, p_lock_token: lockToken, p_error: error });
}

/** Canonical outgoing IDs contain our reserved raw ID. Never parse arbitrary inbound IDs this way. */
export function rawWahaOutgoingId(providerId: string): string | null {
  if (/^[A-Za-z0-9-]{8,190}$/.test(providerId)) return providerId;
  const match = /^true_[1-9][0-9]{5,24}@(c\.us|lid)_([A-Za-z0-9-]{8,190})$/.exec(providerId);
  return match?.[2] || null;
}

export async function knownWahaOutgoingMessage(db: SupabaseClient, channelId: string, providerId: string): Promise<WahaMessage | null> {
  // Avoid interpolating provider data in PostgREST .or() syntax.
  const exact = await db.from("whatsapp_channel_messages").select("*").eq("channel_id", channelId)
    .eq("outgoing_message_id", providerId).maybeSingle<WahaMessage>();
  checkError(exact.error, "OUTGOING_LOOKUP_FAILED");
  if (exact.data) return exact.data;
  const rawId = rawWahaOutgoingId(providerId);
  if (!rawId) return null;
  const reserved = await db.from("whatsapp_channel_messages").select("*").eq("channel_id", channelId)
    .eq("reserved_outgoing_id", rawId).maybeSingle<WahaMessage>();
  checkError(reserved.error, "OUTGOING_LOOKUP_FAILED");
  return reserved.data;
}

export function recordWahaAck(db: SupabaseClient, channelId: string, providerId: string, ack: number): Promise<WahaMessage | null> {
  return rpc(db, "record_whatsapp_channel_ack", { p_channel_id: channelId, p_provider_message_id: providerId, p_ack: ack });
}

export async function getWahaContact(db: SupabaseClient, channelId: string, contactPhone: string): Promise<WahaContact | null> {
  const { data, error } = await db.from("whatsapp_channel_contacts")
    .select("channel_id,contact_phone,paused,paused_at,pause_reason,last_message_at,resumed_at,last_human_message_at,updated_at")
    .eq("channel_id", channelId).eq("contact_phone", contactPhone).maybeSingle<WahaContact>();
  checkError(error, "CONTACT_READ_FAILED");
  return data;
}

export async function isWahaContactPaused(db: SupabaseClient, channelId: string, contactPhone: string): Promise<boolean> {
  return (await getWahaContact(db, channelId, contactPhone))?.paused === true;
}

export function pauseWahaContact(db: SupabaseClient, channelId: string, contactPhone: string, reason = "human_reply", messageAt?: string): Promise<boolean> {
  return rpc(db, "set_whatsapp_channel_contact_pause", { p_channel_id: channelId, p_contact_phone: contactPhone, p_paused: true, p_reason: reason, p_message_at: messageAt || null });
}

export function resumeWahaContact(db: SupabaseClient, channelId: string, contactPhone: string): Promise<boolean> {
  return rpc(db, "set_whatsapp_channel_contact_pause", { p_channel_id: channelId, p_contact_phone: contactPhone, p_paused: false, p_reason: null, p_message_at: null });
}

export function recoverWahaMessages(db: SupabaseClient, limit = 20): Promise<WahaMessage[]> {
  return rpc(db, "recover_whatsapp_channel_messages", { p_limit: limit });
}
