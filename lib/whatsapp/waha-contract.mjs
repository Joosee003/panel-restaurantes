import { createHmac, timingSafeEqual } from 'node:crypto';

// WAHA 2026.8.2: https://waha.devlike.pro/docs/how-to/events/
// HMAC covers the original bytes, including the body timestamp and event ID.
// The caller must also atomically deduplicate events/messages in persistent storage.
export const WAHA_MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
export const WAHA_MAX_BODY_BYTES = 1024 * 1024;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const SESSION_RE = /^[A-Za-z0-9_-]{1,80}$/;
const RAW_ID_RE = /^[A-Za-z0-9-]{1,160}$/;
const SESSION_STATUSES = new Set(['STOPPED', 'STARTING', 'SCAN_QR_CODE', 'WORKING', 'FAILED', 'PASSKEY_REQUIRED', 'PASSKEY_CONFIRMATION_REQUIRED']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_@.:-]{1,190}$/.test(value) ? value : '';

export function validWahaSessionName(value) {
  return typeof value === 'string' && SESSION_RE.test(value);
}

export function verifyWahaSignature(rawBody, headers, secret) {
  if (!(typeof rawBody === 'string' || rawBody instanceof Uint8Array) || typeof secret !== 'string' || !secret) return false;
  const bytes = Buffer.from(rawBody);
  if (!bytes.length || bytes.length > WAHA_MAX_BODY_BYTES) return false;
  const header = name => {
    if (headers && typeof headers.get === 'function') return headers.get(name);
    const key = Object.keys(record(headers)).find(key => key.toLowerCase() === name);
    return key ? headers[key] : null;
  };
  const signature = header('x-webhook-hmac');
  if (header('x-webhook-hmac-algorithm') !== 'sha512' || typeof signature !== 'string' || !/^[a-fA-F0-9]{128}$/.test(signature)) return false;
  return timingSafeEqual(createHmac('sha512', secret).update(bytes).digest(), Buffer.from(signature, 'hex'));
}

// A LID is opaque. Its digits must never become a customer telephone number.
export function normalizeWahaJid(value) {
  if (typeof value !== 'string') return null;
  const phone = /^([1-9][0-9]{6,14})@(?:c\.us|s\.whatsapp\.net)$/.exec(value);
  if (phone) return { kind: 'phone', jid: `${phone[1]}@c.us`, phone: phone[1] };
  if (/^[1-9][0-9]{0,29}@lid$/.test(value)) return { kind: 'lid', jid: value, phone: null };
  return null;
}

export function wahaRawMessageId(value) {
  if (typeof value !== 'string') return null;
  if (RAW_ID_RE.test(value)) return value;
  const match = /^(?:true|false)_([^_]+)_([A-Za-z0-9-]{1,160})$/.exec(value);
  return match && normalizeWahaJid(match[1]) ? match[2] : null;
}

export function resolveWahaLidPhone(jid, response) {
  const identity = normalizeWahaJid(jid);
  const mapping = record(response);
  if (identity?.kind !== 'lid' || mapping.lid !== identity.jid) return null;
  const resolved = normalizeWahaJid(mapping.pn);
  return resolved?.kind === 'phone' ? resolved.phone : null;
}

export function sanitizeWahaSession(value, expectedSession) {
  const input = record(value);
  if (!validWahaSessionName(input.name) || (expectedSession && input.name !== expectedSession)) return null;
  const me = record(input.me);
  const data = record(input.data);
  const timelock = record(me.reachoutTimelock ?? data.reachoutTimelock);
  const capping = record(me.messageCapping ?? data.messageCapping);
  const locked = timelock.isActive === true;
  const capped = capping.cappingStatus === 'CAPPED';
  const ends = [locked ? timelock.timeEnforcementEnds : null, capped ? capping.cycleEnd : null].filter(value => typeof value === 'number' && Number.isFinite(value) && value > 0);
  return {
    name: input.name,
    status: SESSION_STATUSES.has(input.status) ? input.status : 'UNKNOWN',
    phone: normalizeWahaJid(me.id)?.phone ?? null,
    engine: typeof input.engine === 'string' ? input.engine : typeof input.engine?.engine === 'string' ? input.engine.engine : null,
    restricted: locked || capped,
    restrictionUntil: ends.length ? Math.max(...ends) : null,
  };
}

function fresh(timestamp, now) {
  return typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0 && timestamp >= now - WAHA_MAX_EVENT_AGE_MS && timestamp <= now + MAX_FUTURE_MS;
}

export function normalizeWahaEvent(value, { now = Date.now() } = {}) {
  const input = record(value);
  const ignore = reason => ({ kind: 'ignore', reason });
  if (!['message.any', 'message.ack', 'session.status'].includes(input.event)) return ignore('unsupported_event');
  if (!validWahaSessionName(input.session)) return ignore('invalid_session');
  if (!identifier(input.id) || !fresh(input.timestamp, now)) return ignore('invalid_or_stale_event');
  const payload = record(input.payload);
  const base = { eventId: input.id, session: input.session, eventTimestamp: input.timestamp };
  if (input.event === 'session.status') {
    if (payload.name && payload.name !== input.session) return ignore('session_mismatch');
    const session = sanitizeWahaSession({ ...payload, name: input.session, me: input.me, engine: input.engine }, input.session);
    return session ? { kind: 'status', ...base, status: session.status, phone: session.phone, restricted: session.restricted, restrictionUntil: session.restrictionUntil } : ignore('invalid_status');
  }
  if (typeof payload.fromMe !== 'boolean') return ignore('missing_direction');
  const identity = normalizeWahaJid(payload.fromMe ? payload.to : payload.from);
  if (!identity || payload.participant || payload.author || payload.isGroup === true) return ignore('not_direct_message');
  const messageId = identifier(payload.id);
  const rawMessageId = wahaRawMessageId(messageId);
  if (!messageId || !rawMessageId) return ignore('invalid_message_id');
  if (messageId.includes('_')) {
    const match = /^(true|false)_([^_]+)_/.exec(messageId);
    if (!match || (match[1] === 'true') !== payload.fromMe || normalizeWahaJid(match[2])?.jid !== identity.jid) return ignore('message_identity_mismatch');
  }
  if (input.event === 'message.ack') {
    if (!payload.fromMe) return ignore('incoming_ack');
    const statuses = { '-1': 'failed', 0: 'pending', 1: 'accepted', 2: 'delivered', 3: 'read', 4: 'read' };
    if (!Number.isInteger(payload.ack) || !Object.hasOwn(statuses, payload.ack)) return ignore('invalid_ack');
    return { kind: 'ack', ...base, messageId, rawMessageId, jid: identity.jid, ack: payload.ack, status: statuses[payload.ack] };
  }
  if (!fresh(typeof payload.timestamp === 'number' ? payload.timestamp * 1000 : NaN, now)) return ignore('stale_message');
  if (input.history === true || payload.history === true || payload.isHistory === true || payload.isHistorySync === true) return ignore('history_message');
  const type = payload.type;
  const textOnly = (!type || ['text', 'chat', 'conversation', 'extendedTextMessage'].includes(type)) && payload.hasMedia !== true && !payload.media && !payload.location && !payload.reaction && (!Array.isArray(payload.vCards) || payload.vCards.length === 0);
  // Own media messages still indicate that a person may be replying. They must
  // never enter the chatbot, but should pause it just like an own text message.
  if (!payload.fromMe && !textOnly) return ignore('unsupported_message_type');
  const text = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!payload.fromMe && (!text || text.length > 2000)) return ignore('invalid_text');
  const name = typeof payload.pushName === 'string' ? payload.pushName.trim().slice(0, 120) : typeof record(payload._data).pushName === 'string' ? payload._data.pushName.trim().slice(0, 120) : '';
  return {
    kind: 'message', ...base, messageId, rawMessageId, jid: identity.jid, phone: identity.phone,
    text: textOnly ? text.slice(0, 2000) : '', name: name || 'Cliente WhatsApp', timestamp: payload.timestamp,
    fromMe: payload.fromMe, source: ['api', 'app'].includes(payload.source) ? payload.source : 'unknown',
    replyToMessageId: identifier(record(payload.replyTo).id) || null,
  };
}

// A transport receipt is acceptance, never proof of delivery. Timeouts, 5xx,
// malformed successes and ID mismatches are uncertain and must not be retried
// automatically. Reconcile the persisted raw ID against message.ack instead.
export function classifyWahaSendResult({ status, body, id, chatId, networkError = false }) {
  const uncertain = error => ({ status: 'uncertain', messageId: null, error });
  if (networkError || !Number.isInteger(status)) return uncertain('WAHA_SEND_UNCERTAIN');
  if (status >= 200 && status < 300) {
    const result = record(body);
    const returnedId = identifier(result.id);
    if (!RAW_ID_RE.test(id) || !returnedId || wahaRawMessageId(returnedId) !== id || result.fromMe === false) return uncertain('WAHA_RECEIPT_INVALID');
    const recipient = normalizeWahaJid(chatId)?.jid;
    const composite = /^true_([^_]+)_/.exec(returnedId);
    if (!recipient || (returnedId.includes('_') && !composite) || (composite && normalizeWahaJid(composite[1])?.jid !== recipient) || (result.to && normalizeWahaJid(result.to)?.jid !== recipient)) return uncertain('WAHA_RECEIPT_MISMATCH');
    return { status: 'accepted', messageId: returnedId, error: null };
  }
  if (status >= 400 && status < 500 && status !== 408) return { status: 'rejected', messageId: null, error: status === 429 ? 'WAHA_RATE_LIMITED' : 'WAHA_SEND_REJECTED' };
  return uncertain('WAHA_SEND_UNCERTAIN');
}
