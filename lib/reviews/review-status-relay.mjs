import { createHmac, timingSafeEqual } from 'node:crypto';

const providerId = /^wamid\.[A-Za-z0-9._~+/=-]{1,506}$/;
const phoneId = /^[0-9]{5,30}$/;
const allowedStatuses = new Set(['sent', 'delivered', 'read', 'failed']);

export function parseSignedReviewStatuses(raw, headers, secret, allowedPhoneIds, now = Date.now()) {
  if (!secret || secret.length < 32 || !raw || raw.length > 65_536) return null;
  const get = key => typeof headers?.get === 'function' ? headers.get(key) : headers?.[key];
  const timestamp = get('x-gastrohelp-relay-timestamp');
  const signature = get('x-gastrohelp-relay-signature');
  if (!/^\d{10}$/.test(timestamp || '') || !/^sha256=[a-f0-9]{64}$/i.test(signature || '')) return null;
  if (Math.abs(now - Number(timestamp) * 1000) > 300_000) return null;
  const expected = createHmac('sha256', secret).update(timestamp).update('.').update(raw).digest();
  const supplied = Buffer.from(signature.slice(7), 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  return parseStatuses(raw, allowedPhoneIds, now);
}

// The active n8n Meta webhook validates X-Hub-Signature-256 before this relay.
// Its existing Header Auth credential can authenticate the second hop without
// exposing another secret in workflow parameters. Signed relays remain accepted.
export function parseAuthenticatedReviewStatuses(raw, headers, secret, allowedPhoneIds, now = Date.now()) {
  const get = key => typeof headers?.get === 'function' ? headers.get(key) : headers?.[key];
  if (get('x-gastrohelp-relay-timestamp') || get('x-gastrohelp-relay-signature')) {
    return parseSignedReviewStatuses(raw, headers, secret, allowedPhoneIds, now);
  }
  if (!secret || secret.length < 32 || !raw || raw.length > 65_536) return null;
  const supplied = get('x-gastrohelp-webhook-secret');
  if (typeof supplied !== 'string') return null;
  const expected = Buffer.from(secret);
  const received = Buffer.from(supplied);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  return parseStatuses(raw, allowedPhoneIds, now);
}

function parseStatuses(raw, allowedPhoneIds, now) {
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { return null; }
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || !phoneId.test(data.phoneNumberId || '')
    || !allowedPhoneIds?.split(',').map(id => id.trim()).includes(data.phoneNumberId)
    || !Array.isArray(data.statuses) || data.statuses.length < 1 || data.statuses.length > 20) return null;
  const statuses = [];
  for (const item of data.statuses) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || !providerId.test(item.id || '') || !allowedStatuses.has(item.status)
      || !/^\d{10}$/.test(String(item.timestamp || ''))) return null;
    const at = Number(item.timestamp) * 1000;
    if (!Number.isSafeInteger(at) || at > now + 300_000 || at < Date.UTC(2020, 0, 1)) return null;
    statuses.push({ id: item.id, status: item.status, at: new Date(at).toISOString() });
  }
  return statuses;
}
