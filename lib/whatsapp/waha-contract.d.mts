export const WAHA_MAX_EVENT_AGE_MS: number;
export const WAHA_MAX_BODY_BYTES: number;
export type WahaIdentity = { kind: 'phone' | 'lid'; jid: string; phone: string | null };
export type WahaSession = { name: string; status: string; phone: string | null; engine: string | null; restricted: boolean; restrictionUntil: number | null };
type EventBase = { eventId: string; session: string; eventTimestamp: number };
export type WahaEvent =
  | { kind: 'ignore'; reason: string }
  | (EventBase & { kind: 'status'; status: string; phone: string | null; restricted: boolean; restrictionUntil: number | null })
  | (EventBase & { kind: 'ack'; messageId: string; rawMessageId: string; jid: string; ack: number; status: 'pending' | 'accepted' | 'delivered' | 'read' | 'failed' })
  | (EventBase & { kind: 'message'; messageId: string; rawMessageId: string; jid: string; phone: string | null; text: string; name: string; timestamp: number; fromMe: boolean; source: 'app' | 'api' | 'unknown'; replyToMessageId: string | null });
export type WahaSendReceipt = { status: 'accepted' | 'rejected' | 'uncertain'; messageId: string | null; error: string | null };
export function validWahaSessionName(value: unknown): value is string;
export function verifyWahaSignature(rawBody: string | Uint8Array, headers: Headers | Record<string, unknown>, secret: string): boolean;
export function normalizeWahaJid(value: unknown): WahaIdentity | null;
export function wahaRawMessageId(value: unknown): string | null;
export function resolveWahaLidPhone(jid: string, response: unknown): string | null;
export function sanitizeWahaSession(value: unknown, expectedSession?: string): WahaSession | null;
export function normalizeWahaEvent(value: unknown, options?: { now?: number }): WahaEvent;
export function classifyWahaSendResult(input: { status?: number; body?: unknown; id: string; chatId: string; networkError?: boolean }): WahaSendReceipt;
