import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as contract from '../lib/whatsapp/waha-contract.mjs';

const now = Date.UTC(2026, 8, 13, 12);
const phone = '447700900135';
const jid = `${phone}@c.us`;
const session = 'gh_76000000000040008000000000000001';
const event = (payload = {}, extra = {}) => ({
  id: 'evt_01jjjjjjjjjjjjjjjjjjjjjjjj', timestamp: now, session, event: 'message.any', engine: 'GOWS',
  payload: { id: `false_${jid}_3EB01234`, timestamp: now / 1000, from: jid, to: '34600000001@c.us', fromMe: false, body: 'Quiero reservar para hoy', hasMedia: false, ...payload },
  ...extra,
});
const normalize = value => contract.normalizeWahaEvent(value, { now });

test('WAHA published SHA512 vector authenticates original bytes, not reparsed JSON', () => {
  const raw = '{"event":"message","session":"default","engine":"WEBJS"}';
  const headers = new Headers({ 'X-Webhook-Hmac-Algorithm': 'sha512', 'X-Webhook-Hmac': '208f8a55dde9e05519e898b10b89bf0d0b3b0fdf11fdbf09b6b90476301b98d8097c462b2b17a6ce93b6b47a136cf2e78a33a63f6752c2c1631777076153fa89' });
  assert.equal(contract.verifyWahaSignature(raw, headers, 'my-secret-key'), true);
  assert.equal(contract.verifyWahaSignature(`${raw}\n`, headers, 'my-secret-key'), false);
  assert.equal(contract.verifyWahaSignature(raw, headers, 'wrong-secret'), false);
  headers.set('X-Webhook-Hmac-Algorithm', 'sha256');
  assert.equal(contract.verifyWahaSignature(raw, headers, 'my-secret-key'), false);
});

test('Forged, duplicate-valued, missing and oversized HMAC inputs fail closed', () => {
  const raw = JSON.stringify(event());
  const signature = createHmac('sha512', 'fixture').update(raw).digest('hex');
  assert.equal(contract.verifyWahaSignature(raw, { 'X-Webhook-Hmac': signature, 'X-Webhook-Hmac-Algorithm': 'sha512' }, 'fixture'), true);
  for (const value of ['', signature.slice(1), `${signature}, ${signature}`, `sha512=${signature}`, 'z'.repeat(128)]) assert.equal(contract.verifyWahaSignature(raw, { 'x-webhook-hmac': value, 'x-webhook-hmac-algorithm': 'sha512' }, 'fixture'), false);
  assert.equal(contract.verifyWahaSignature(raw, {}, 'fixture'), false);
  assert.equal(contract.verifyWahaSignature('x'.repeat(contract.WAHA_MAX_BODY_BYTES + 1), {}, 'fixture'), false);
});

test('LID digits never become a phone and mapping must match the requested hidden ID', () => {
  const lid = '998877665544332211@lid';
  assert.deepEqual(contract.normalizeWahaJid(lid), { kind: 'lid', jid: lid, phone: null });
  assert.equal(contract.resolveWahaLidPhone(lid, { lid, pn: null }), null);
  assert.equal(contract.resolveWahaLidPhone(lid, { lid: '123@lid', pn: jid }), null);
  assert.equal(contract.resolveWahaLidPhone(lid, { lid, pn: lid }), null);
  assert.equal(contract.resolveWahaLidPhone(lid, { lid, pn: `${phone}@s.whatsapp.net` }), phone);
  for (const value of [phone, `+${phone}@c.us`, `${phone}:4@s.whatsapp.net`, 'status@broadcast', '123@g.us', '123@newsletter', '12345@c.us', '../session@c.us']) assert.equal(contract.normalizeWahaJid(value), null);
});

test('Phone and message identities stay tied to their session and chat', () => {
  const result = normalize(event());
  assert.equal(result.kind, 'message');
  assert.equal(result.session, session);
  assert.equal(result.phone, phone);
  assert.equal(result.rawMessageId, '3EB01234');
  assert.equal(normalize(event({ id: `true_${jid}_3EB01234` })).reason, 'message_identity_mismatch');
  assert.equal(normalize(event({ id: 'false_34600000002@c.us_3EB01234' })).reason, 'message_identity_mismatch');
  assert.equal(normalize(event({}, { session: '../other-restaurant' })).reason, 'invalid_session');
});

test('Signed timestamp is required even if transport headers could claim a fresh retry', () => {
  for (const timestamp of [null, undefined, '1789300800000', now + 300001, now - contract.WAHA_MAX_EVENT_AGE_MS - 1]) assert.equal(normalize(event({}, { timestamp })).reason, 'invalid_or_stale_event');
  assert.equal(normalize(event({}, { id: undefined })).reason, 'invalid_or_stale_event');
  assert.equal(normalize(event({ timestamp: (now - contract.WAHA_MAX_EVENT_AGE_MS - 1) / 1000 })).reason, 'stale_message');
  assert.equal(normalize(event({ isHistory: true })).reason, 'history_message');
  assert.equal(normalize(event({ isHistorySync: true })).reason, 'history_message');
});

test('A retried event has stable event and message keys for persistent replay protection', () => {
  const first = normalize(event());
  const retried = normalize(event());
  assert.equal(first.eventId, retried.eventId);
  assert.equal(first.messageId, retried.messageId);
  const newEventSameMessage = normalize(event({}, { id: 'evt_01kkkkkkkkkkkkkkkkkkkkkkkk' }));
  assert.notEqual(first.eventId, newEventSameMessage.eventId);
  assert.equal(first.rawMessageId, newEventSameMessage.rawMessageId);
});

test('Groups, broadcasts, newsletters, reactions and historical event types never trigger a bot', () => {
  for (const from of ['12345@g.us', 'status@broadcast', '123@newsletter', '123@broadcast']) assert.equal(normalize(event({ from })).kind, 'ignore');
  for (const field of [{ participant: jid }, { isGroup: true }, { reaction: { text: '👍' } }, { hasMedia: true }, { type: 'location', body: 'coordinates' }, { vCards: ['private-card'] }]) assert.equal(normalize(event(field)).kind, 'ignore');
  for (const name of ['message', 'engine.event', 'message.edited', 'message.reaction', 'history.sync']) assert.equal(normalize(event({}, { event: name })).kind, 'ignore');
});

test('Personal replies are distinct from our own API replies and never enter as incoming messages', () => {
  for (const source of ['app', 'api', undefined]) {
    const result = normalize(event({ from: '34600000001@c.us', to: jid, fromMe: true, source, id: `true_${jid}_3EB0ABCD` }));
    assert.equal(result.kind, 'message');
    assert.equal(result.fromMe, true);
    assert.equal(result.source, source || 'unknown');
    assert.equal(result.phone, phone);
  }
  const ownPhoto = normalize(event({ fromMe: true, to: jid, id: `true_${jid}_3EB0ABCD`, source: 'app', hasMedia: true, body: '' }));
  assert.equal(ownPhoto.kind, 'message');
  assert.equal(ownPhoto.fromMe, true);
  assert.equal(ownPhoto.text, '');
});

test('ACK distinguishes acceptance from delivery and read without trusting an incoming ACK', () => {
  for (const [ack, status] of [[-1, 'failed'], [0, 'pending'], [1, 'accepted'], [2, 'delivered'], [3, 'read'], [4, 'read']]) {
    const result = normalize(event({ fromMe: true, to: jid, id: `true_${jid}_3EB0ABCD`, ack }, { event: 'message.ack' }));
    assert.equal(result.kind, 'ack');
    assert.equal(result.status, status);
  }
  assert.equal(normalize(event({ ack: 3 }, { event: 'message.ack' })).reason, 'incoming_ack');
});

test('Connected does not mean unrestricted; sensitive session config is excluded', () => {
  const result = contract.sanitizeWahaSession({ name: session, status: 'WORKING', config: { webhooks: [{ hmac: { key: 'private-key' } }] }, me: { id: jid, messageCapping: { cappingStatus: 'CAPPED', cycleEnd: now / 1000 + 3600 } } });
  assert.equal(result.restricted, true);
  assert.equal(result.restrictionUntil, now / 1000 + 3600);
  assert.equal(result.phone, phone);
  assert.equal('config' in result, false);
  assert.equal(JSON.stringify(result).includes('private-key'), false);
  assert.equal(contract.sanitizeWahaSession({ name: session, status: 'WORKING' }, 'other'), null);
  assert.equal(normalize(event({ name: 'other', status: 'WORKING' }, { event: 'session.status' })).reason, 'session_mismatch');
});

test('Only a matching successful send receipt is accepted; malformed successes and timeouts stay uncertain', () => {
  const input = { id: '3EB0ABCD', chatId: jid };
  assert.equal(contract.classifyWahaSendResult({ ...input, status: 201, body: { id: `true_${jid}_3EB0ABCD`, to: jid, fromMe: true } }).status, 'accepted');
  for (const body of [null, {}, { id: 'OTHER' }, { id: '3EB0ABCD', fromMe: false }, { id: `false_${jid}_3EB0ABCD` }, { id: 'true_34600000002@c.us_3EB0ABCD' }]) assert.equal(contract.classifyWahaSendResult({ ...input, status: 200, body }).status, 'uncertain');
  for (const status of [408, 500, 502, 503]) assert.equal(contract.classifyWahaSendResult({ ...input, status }).status, 'uncertain');
  for (const status of [400, 401, 403, 404, 422, 429]) assert.equal(contract.classifyWahaSendResult({ ...input, status }).status, 'rejected');
  assert.equal(contract.classifyWahaSendResult({ ...input, networkError: true }).status, 'uncertain');
});

const clientSource = ts.transpileModule(readFileSync(new URL('../lib/whatsapp/waha-api.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const clientEnv = { NODE_ENV: 'production', WAHA_BASE_URL: 'https://waha.fixture.invalid', WAHA_API_KEY: 'fixture-api-key-not-a-real-secret-123', WAHA_WEBHOOK_SECRET: 'fixture-hmac-not-a-real-secret-12345' };
function loadClient(fetcher, env = {}) {
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', 'process', 'fetch', clientSource)(name => {
    if (name === 'server-only') return {};
    if (name === './waha-contract.mjs') return contract;
    throw new Error(`Unexpected module ${name}`);
  }, loaded, loaded.exports, { env: { ...clientEnv, ...env } }, fetcher);
  return loaded.exports;
}
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('Client refuses unsafe production URLs and absent credentials before a request', async () => {
  const never = () => { throw new Error('Should not call a remote service'); };
  for (const url of ['http://waha.fixture.invalid', 'http://localhost:3000', 'https://user:pass@waha.fixture.invalid', 'https://waha.fixture.invalid?key=secret', 'https://waha.fixture.invalid#fragment', 'not-url']) assert.equal(loadClient(never, { WAHA_BASE_URL: url }).wahaConfigured(), false);
  assert.equal(loadClient(never, { WAHA_API_KEY: '' }).wahaConfigured(), false);
  assert.equal(loadClient(never, { WAHA_BASE_URL: 'http://localhost:3000', NODE_ENV: 'development' }).wahaConfigured(), true);
  await assert.rejects(loadClient(never).getWahaSession('../other'), error => error.code === 'WAHA_SESSION_INVALID');
});

test('Create session signs events, retries inbound delivery and minimizes stored history', async () => {
  let request;
  const client = loadClient(async (url, options) => { request = { url, options }; return response({ name: session, status: 'STOPPED', config: { secret: 'upstream-private' } }, 201); });
  const result = await client.createWahaSession(session, 'https://panel.fixture.invalid/api/whatsapp/waha/webhook');
  const sent = JSON.parse(request.options.body);
  assert.equal(sent.start, false);
  assert.deepEqual(sent.config.webhooks[0].events, ['message.any', 'session.status', 'message.ack']);
  assert.equal(sent.config.webhooks[0].hmac.key, clientEnv.WAHA_WEBHOOK_SECRET);
  assert.equal(sent.config.webhooks[0].retries.policy, 'exponential');
  assert.equal(sent.config.gows.storage.messages, false);
  assert.equal(sent.config.ignore.groups, true);
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('LID resolution uses the session endpoint and rejects null or mismatched mappings', async () => {
  const lid = '998877665544332211@lid';
  const calls = [];
  const client = loadClient(async url => { calls.push(url); return response({ lid, pn: null }); });
  assert.equal(await client.resolveWahaPhone(session, lid), null);
  assert.equal(calls[0], `https://waha.fixture.invalid/api/${session}/lids/998877665544332211%40lid`);
  assert.equal(await client.resolveWahaPhone(session, jid), phone);
  assert.equal(calls.length, 1);
  assert.equal(await loadClient(async () => response({ lid: 'other@lid', pn: jid })).resolveWahaPhone(session, lid), null);
});

test('Preallocated ID is used once in sendText, including after a network loss or server failure', async () => {
  for (const failure of ['network', 'server']) {
    const calls = [];
    const client = loadClient(async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/new-message-id')) return response({ id: '3EB0ABCD' });
      if (failure === 'network') throw new Error('sensitive-upstream-address-and-key');
      return response({ error: 'private upstream detail' }, 503);
    });
    const id = await client.getWahaNewMessageId(session);
    const result = await client.sendWahaText({ session, chatId: jid, text: 'Tu reserva está confirmada.', id });
    assert.equal(result.status, 'uncertain');
    assert.equal(calls.length, 2);
    assert.equal(JSON.parse(calls[1].options.body).id, '3EB0ABCD');
    assert.equal(JSON.stringify(result).includes('sensitive'), false);
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
});

test('QR proxy checks real PNG bytes and never exposes upstream HTML or URLs', async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const good = loadClient(async () => new Response(png, { headers: { 'Content-Type': 'image/png' } }));
  assert.deepEqual(await good.getWahaQr(session), { data: png, mimetype: 'image/png' });
  const bad = loadClient(async () => new Response('<html>private debug response</html>', { headers: { 'Content-Type': 'image/png' } }));
  await assert.rejects(bad.getWahaQr(session), error => error.code === 'WAHA_QR_INVALID' && !error.message.includes('private'));
});

test('Missing session has safe read and disconnect behavior without pretending it connected', async () => {
  const client = loadClient(async () => response({ config: 'private-key' }, 404));
  assert.equal(await client.getWahaSession(session), null);
  assert.equal((await client.stopWahaSession(session)).status, 'STOPPED');
  assert.equal((await client.logoutWahaSession(session)).status, 'STOPPED');
});
