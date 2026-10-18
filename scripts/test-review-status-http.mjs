// Actual local Next route with a synthetic PostgREST RPC substitute.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { restoreApplicationCatalog } from './recovery-catalog.mjs';
import { seedReviews, addReviewVisit, claimReview, checkDelivery, finishDelivery, requestRow, reviewActor } from './review-schema-checks.mjs';

const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
const secret = 'synthetic-review-status-relay-key-123456789';
let next, api;
const bounded = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Local HTTP test timed out')), ms); })]).finally(() => clearTimeout(timer));
};
try {
  const catalog = JSON.parse(await readFile(new URL('../tests/fixtures/application-catalog-2026-09-08.json', import.meta.url), 'utf8'));
  assert.equal(catalog.fixture_only, true);
  await restoreApplicationCatalog(db, catalog);
  for (const name of ['20260908164431_post_visit_review_requests.sql', '20260913111203_per_restaurant_waha_channels.sql',
    '20260913111211_waha_review_recheck.sql', '20261017120000_review_provider_states.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  }
  await db.exec('alter role service_role bypassrls');
  await seedReviews(db);
  await addReviewVisit(db);
  const event = await claimReview(db);
  assert.equal((await checkDelivery(db, event)).allowed, true);
  assert.equal(await finishDelivery(db, event, 'sent', 'wamid.local-http'), true);

  api = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || req.url !== '/rest/v1/rpc/record_review_provider_status') {
        res.writeHead(404); res.end(); return;
      }
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const args = JSON.parse(raw);
      await reviewActor(db, null, 'service_role');
      const result = (await db.query('select record_review_provider_status($1,$2,$3) result',
        [args.p_message_id, args.p_status, args.p_event_at])).rows[0].result;
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
    } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'synthetic_rpc_error' })); }
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:3042';
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3042'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${api.address().port}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon-key', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key',
      N8N_REVIEW_WEBHOOK_SECRET: secret, N8N_REVIEW_STATUS_PHONE_NUMBER_IDS: '1234567890' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  next.stdout.on('data', chunk => log += chunk);
  next.stderr.on('data', chunk => log += chunk);
  await bounded(new Promise((resolve, reject) => {
    next.on('error', reject);
    next.on('exit', code => reject(new Error(`Next exited: ${code} ${log.slice(-1000)}`)));
    const check = () => { if (log.includes('Ready in')) resolve(); else if (next.exitCode !== null) reject(new Error(log)); else setTimeout(check, 100); };
    check();
  }), 20_000);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const raw = JSON.stringify({ phoneNumberId: '1234567890', statuses: [{ id: 'wamid.local-http', status: 'delivered', timestamp }] });
  const signature = createHmac('sha256', secret).update(timestamp).update('.').update(raw).digest('hex');
  const url = `${origin}/api/reviews/provider-status`;
  assert.equal((await fetch(url, { method: 'POST', body: raw })).status, 403);
  const result = await fetch(url, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-GastroHelp-Relay-Timestamp': timestamp,
    'X-GastroHelp-Relay-Signature': `sha256=${signature}`,
  }, body: raw });
  assert.equal(result.status, 200);
  const readResult = await fetch(url, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-GastroHelp-Webhook-Secret': secret,
  }, body: JSON.stringify({ phoneNumberId: '1234567890', statuses: [{ id: 'wamid.local-http', status: 'read', timestamp }] }) });
  assert.equal(readResult.status, 200);
  await reviewActor(db, null, 'service_role');
  assert.equal((await requestRow(db)).status, 'read');
  console.log(JSON.stringify({ status: 'passed', checks: [
    'Unsigned request is rejected before the database.',
    'Signed and existing-credential callbacks reach the RPC and advance the request without sending a message.',
  ] }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', message: error.message, stack: error.stack }));
  process.exitCode = 1;
} finally {
  if (next?.pid) { const stopped = new Promise(resolve => next.once('exit', resolve)); next.kill('SIGTERM'); await bounded(stopped, 5000).catch(() => next.kill('SIGKILL')); }
  if (api) await new Promise(resolve => api.close(resolve));
  await db.close();
}
