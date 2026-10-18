import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { parseSignedReviewStatuses, parseAuthenticatedReviewStatuses } from '../lib/reviews/review-status-relay.mjs';

const secret = 'synthetic-relay-key-for-local-tests-only-123456789';
const now = Date.parse('2026-10-17T12:00:00Z');
const timestamp = String(Math.floor(now / 1000));
const body = { phoneNumberId: '1234567890', statuses: [
  { id: 'wamid.synthetic-one', status: 'delivered', timestamp },
  { id: 'wamid.synthetic-one', status: 'read', timestamp },
] };
function signed(value = body, at = timestamp, key = secret) {
  const raw = Buffer.from(JSON.stringify(value));
  const signature = createHmac('sha256', key).update(at).update('.').update(raw).digest('hex');
  return { raw, headers: new Headers({
    'x-gastrohelp-relay-timestamp': at, 'x-gastrohelp-relay-signature': `sha256=${signature}`,
  }) };
}

test('signed relay accepts bounded synthetic status batches for an allowlisted sender', () => {
  const { raw, headers } = signed();
  assert.deepEqual(parseSignedReviewStatuses(raw, headers, secret, '1234567890', now).map(x => x.status), ['delivered', 'read']);
  assert.equal(parseSignedReviewStatuses(raw, headers, secret, '9999999999', now), null);
});

test('payload tampering, wrong key, stale signature and malformed statuses fail before storage', () => {
  const { raw, headers } = signed();
  assert.equal(parseSignedReviewStatuses(Buffer.from(raw.toString().replace('read', 'failed')), headers, secret, '1234567890', now), null);
  assert.equal(parseSignedReviewStatuses(raw, headers, `${secret}wrong`, '1234567890', now), null);
  assert.equal(parseSignedReviewStatuses(raw, headers, secret, '1234567890', now + 301_000), null);
  for (const invalid of [
    { ...body, statuses: [] },
    { ...body, statuses: [{ id: 'other-message', status: 'read', timestamp }] },
    { ...body, statuses: [{ id: 'wamid.synthetic-one', status: 'accepted', timestamp }] },
    { ...body, statuses: [{ id: 'wamid.synthetic-one', status: 'read', timestamp: '123' }] },
    { ...body, phoneNumberId: 'another' },
  ]) {
    const item = signed(invalid);
    assert.equal(parseSignedReviewStatuses(item.raw, item.headers, secret, '1234567890', now), null);
  }
});

test('existing n8n Header Auth credential authenticates a Meta-validated relay', () => {
  const raw = Buffer.from(JSON.stringify(body));
  const headers = new Headers({ 'x-gastrohelp-webhook-secret': secret });
  assert.deepEqual(parseAuthenticatedReviewStatuses(raw, headers, secret, '1234567890', now).map(x => x.status), ['delivered', 'read']);
  assert.equal(parseAuthenticatedReviewStatuses(raw, new Headers(), secret, '1234567890', now), null);
  assert.equal(parseAuthenticatedReviewStatuses(raw, new Headers({ 'x-gastrohelp-webhook-secret': `${secret}wrong` }), secret, '1234567890', now), null);
  assert.equal(parseAuthenticatedReviewStatuses(raw, headers, secret, '9999999999', now), null);
  const tamperedHeaders = new Headers(headers);
  tamperedHeaders.set('x-gastrohelp-relay-signature', 'sha256=' + '0'.repeat(64));
  assert.equal(parseAuthenticatedReviewStatuses(raw, tamperedHeaders, secret, '1234567890', now), null);
});
