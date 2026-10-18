import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function compile(file, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => imports[name] || require(name), module, module.exports);
  return module.exports;
}

const flow = compile('../lib/reviews/review-flow.ts');
const { deliverVisitReview, reviewMetaSelected } = compile('../lib/reviews/review-delivery.ts', { './review-flow': flow });
const restaurant = '72000000-0000-4000-8000-000000000001';
const other = '72000000-0000-4000-8000-000000000002';
const token = '77000000-0000-4000-8000-000000000001';
const event = { event_id: `visit.review_request:${token}`, restaurante_id: restaurant, lock_token: token };
const delivery = { allowed: true, token, name: 'Cliente Prueba', phone: '+34600006049', restaurantName: 'Restaurante ficticio', deliveryMode: 'live' };
const env = { WHATSAPP_REVIEW_RESTAURANT_IDS: restaurant,
  N8N_REVIEW_WEBHOOK_URL: 'https://n8n.gastrohelp.es/webhook/review-fixture',
  N8N_REVIEW_WEBHOOK_SECRET: 'test-only-secret' };

function fixture(environment = env) {
  const calls = [];
  const rpc = async (name, args) => {
    calls.push({ kind: 'rpc', name, args });
    return { data: name === 'get_visit_review_delivery' ? delivery : true, error: null };
  };
  const transport = async (_url, init) => {
    calls.push({ kind: 'meta', init });
    return { status: 200, ok: true, json: async () => ({ ok: true, eventId: event.event_id,
      deliveryMode: 'live', provider: 'whatsapp', outcome: 'sent', messageId: 'wamid.fixture' }) };
  };
  const ownChannel = async () => { calls.push({ kind: 'waha' }); return { outcome: 'sent', messageId: 'waha:fixture' }; };
  return { calls, run: (e = event) => deliverVisitReview(e, rpc, environment, transport, ownChannel) };
}

test('only an assigned restaurant uses shared Meta and records provider acceptance', async () => {
  const f = fixture();
  assert.equal(reviewMetaSelected(env, restaurant), true);
  assert.equal(reviewMetaSelected(env, other), false);
  assert.deepEqual(await f.run(), { eventId: event.event_id, status: 'accepted_by_whatsapp' });
  assert.deepEqual(f.calls.map(c => c.kind || c.name), ['rpc', 'meta', 'rpc']);
  const completed = f.calls.at(-1).args;
  assert.equal(completed.p_outcome, 'sent');
  assert.equal(completed.p_message_id, 'wamid.fixture');
  const body = JSON.parse(f.calls[1].init.body);
  assert.equal(body.restaurantId, restaurant);
  assert.equal(body.review.phone, '34600006049');
});

test('an assigned restaurant with missing webhook config is blocked without WAHA fallback', async () => {
  const f = fixture({ WHATSAPP_REVIEW_RESTAURANT_IDS: restaurant });
  assert.deepEqual(await f.run(), { eventId: event.event_id, status: 'blocked' });
  assert.equal(f.calls.some(c => c.kind === 'meta' || c.kind === 'waha'), false);
  assert.equal(f.calls.at(-1).args.p_error, 'whatsapp_not_configured');
});

test('a different restaurant keeps its own-channel route', async () => {
  const f = fixture();
  const e = { ...event, restaurante_id: other };
  assert.deepEqual(await f.run(e), { eventId: event.event_id, status: 'accepted_by_whatsapp' });
  assert.deepEqual(f.calls.map(c => c.kind || c.name), ['rpc', 'waha', 'rpc']);
});
