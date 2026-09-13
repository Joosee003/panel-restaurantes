import 'server-only';
import {
  classifyWahaSendResult, normalizeWahaJid, resolveWahaLidPhone,
  sanitizeWahaSession, validWahaSessionName, wahaRawMessageId,
  type WahaSendReceipt, type WahaSession,
} from './waha-contract.mjs';

export type { WahaSendReceipt, WahaSession } from './waha-contract.mjs';
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class WahaApiError extends Error {
  constructor(public readonly code: string, public readonly status: number | null = null) {
    super(code);
    this.name = 'WahaApiError';
  }
}

function validateUrl(value: string | undefined): URL {
  let url: URL;
  try { url = new URL(value || ''); } catch { throw new WahaApiError('WAHA_NOT_CONFIGURED'); }
  const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) throw new WahaApiError('WAHA_URL_INVALID');
  return url;
}

function configuration() {
  const base = validateUrl(process.env.WAHA_BASE_URL);
  const key = process.env.WAHA_API_KEY;
  const secret = process.env.WAHA_WEBHOOK_SECRET;
  if (!key || key.length < 32 || !secret || secret.length < 32 || /[\r\n]/.test(key)) throw new WahaApiError('WAHA_NOT_CONFIGURED');
  return { base, key, secret };
}

export function wahaConfigured(): boolean {
  try { configuration(); return true; } catch { return false; }
}

function sessionPath(session: string) {
  if (!validWahaSessionName(session)) throw new WahaApiError('WAHA_SESSION_INVALID');
  return encodeURIComponent(session);
}

async function request(path: string, options: { method?: 'GET' | 'POST'; body?: unknown; image?: boolean } = {}) {
  const { base, key } = configuration();
  const url = `${base.toString().replace(/\/$/, '')}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET', cache: 'no-store', redirect: 'error', signal: controller.signal,
      headers: { 'X-Api-Key': key, Accept: options.image ? 'image/png' : 'application/json', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    if (Number(response.headers.get('content-length') || 0) > MAX_RESPONSE_BYTES) throw new WahaApiError('WAHA_RESPONSE_INVALID', response.status);
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader) {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.byteLength;
        if (length > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new WahaApiError('WAHA_RESPONSE_INVALID', response.status); }
        chunks.push(next.value);
      }
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let body: unknown = null;
    if (!options.image) {
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { /* malformed receipt remains uncertain */ }
    }
    return { status: response.status, body, bytes, contentType: response.headers.get('content-type') || '' };
  } catch (error) {
    if (error instanceof WahaApiError) throw error;
    // Never expose upstream URL, key, response body, session config or raw errors.
    throw new WahaApiError('WAHA_REQUEST_UNCERTAIN');
  } finally { clearTimeout(timeout); }
}

function assertSuccess(status: number) {
  if (status < 200 || status >= 300) throw new WahaApiError(status === 429 ? 'WAHA_RATE_LIMITED' : 'WAHA_REQUEST_FAILED', status);
}

function requireSession(body: unknown, session: string): WahaSession {
  const clean = sanitizeWahaSession(body, session);
  if (!clean) throw new WahaApiError('WAHA_RESPONSE_INVALID');
  return clean;
}

export async function getWahaSession(session: string): Promise<WahaSession | null> {
  const result = await request(`/api/sessions/${sessionPath(session)}`);
  if (result.status === 404) return null;
  assertSuccess(result.status);
  return requireSession(result.body, session);
}

export async function createWahaSession(session: string, webhookUrl: string): Promise<WahaSession> {
  sessionPath(session);
  const webhook = validateUrl(webhookUrl);
  const { secret } = configuration();
  const result = await request('/api/sessions', { method: 'POST', body: {
    name: session, start: false,
    config: {
      debug: false,
      ignore: { status: true, groups: true, channels: true, broadcast: true },
      gows: { storage: { messages: false, groups: false, chats: false, labels: false, contacts: false, messageSecrets: false } },
      webhooks: [{ url: webhook.toString(), events: ['message.any', 'session.status', 'message.ack'], hmac: { key: secret }, retries: { policy: 'exponential', delaySeconds: 2, attempts: 8 } }],
    },
  } });
  assertSuccess(result.status);
  return requireSession(result.body, session);
}

async function sessionAction(session: string, action: 'start' | 'stop' | 'logout'): Promise<WahaSession> {
  const result = await request(`/api/sessions/${sessionPath(session)}/${action}`, { method: 'POST' });
  if (result.status === 404 && action !== 'start') return { name: session, status: 'STOPPED', phone: null, engine: null, restricted: false, restrictionUntil: null };
  assertSuccess(result.status);
  return requireSession(result.body, session);
}
export const startWahaSession = (session: string) => sessionAction(session, 'start');
export const stopWahaSession = (session: string) => sessionAction(session, 'stop');
export const logoutWahaSession = (session: string) => sessionAction(session, 'logout');

export async function getWahaQr(session: string): Promise<{ data: Uint8Array; mimetype: 'image/png' }> {
  const result = await request(`/api/${sessionPath(session)}/auth/qr?format=image`, { image: true });
  assertSuccess(result.status);
  const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!result.contentType.toLowerCase().startsWith('image/png') || !pngHeader.every((value, index) => result.bytes[index] === value)) throw new WahaApiError('WAHA_QR_INVALID');
  return { data: result.bytes, mimetype: 'image/png' };
}

export async function resolveWahaPhone(session: string, jid: string): Promise<string | null> {
  sessionPath(session);
  const identity = normalizeWahaJid(jid);
  if (!identity) return null;
  if (identity.kind === 'phone') return identity.phone;
  const result = await request(`/api/${sessionPath(session)}/lids/${encodeURIComponent(identity.jid)}`);
  if (result.status === 404) return null;
  assertSuccess(result.status);
  return resolveWahaLidPhone(identity.jid, result.body);
}

export async function getWahaNewMessageId(session: string): Promise<string> {
  const result = await request(`/api/${sessionPath(session)}/new-message-id`);
  assertSuccess(result.status);
  const id = result.body && typeof result.body === 'object' && 'id' in result.body ? result.body.id : null;
  if (typeof id !== 'string' || wahaRawMessageId(id) !== id || id.includes('_')) throw new WahaApiError('WAHA_MESSAGE_ID_INVALID');
  return id;
}

export async function sendWahaText(input: { session: string; chatId: string; text: string; id: string; replyToMessageId?: string | null }): Promise<WahaSendReceipt> {
  sessionPath(input.session);
  const identity = normalizeWahaJid(input.chatId);
  if (!identity || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4096 || wahaRawMessageId(input.id) !== input.id || input.id.includes('_') || (input.replyToMessageId && !wahaRawMessageId(input.replyToMessageId))) throw new WahaApiError('WAHA_MESSAGE_INVALID');
  // No retries here. The caller has persisted this ID before the single POST.
  try {
    const result = await request('/api/sendText', { method: 'POST', body: {
      session: input.session, chatId: identity.jid, text: input.text, id: input.id, linkPreview: false,
      ...(input.replyToMessageId ? { reply_to: input.replyToMessageId } : {}),
    } });
    return classifyWahaSendResult({ status: result.status, body: result.body, id: input.id, chatId: identity.jid });
  } catch {
    return { status: 'uncertain', messageId: null, error: 'WAHA_SEND_UNCERTAIN' };
  }
}
