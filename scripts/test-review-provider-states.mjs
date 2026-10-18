// Synthetic, in-memory SQL contract: no service or customer is contacted.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { restoreApplicationCatalog } from './recovery-catalog.mjs';
import { seedReviews, addReviewVisit, reviewActor, reviewAction, requestRow,
  claimReview, checkDelivery, finishDelivery, reviewIds as I } from './review-schema-checks.mjs';

const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
const checks = [];
const migration = async name => db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
const status = async (id, kind, seconds = Math.floor(Date.now() / 1000)) =>
  (await db.query('select record_review_provider_status($1,$2,to_timestamp($3)) result', [id, kind, seconds])).rows[0].result;
const message = async id => (await db.query('select * from review_provider_messages where provider_message_id=$1', [id])).rows[0];
const queue = async () => (await db.query("select * from reservation_webhook_deliveries where event_id=$1", [`visit.review_request:${I.reservation}`])).rows[0];

try {
  const catalog = JSON.parse(await readFile(new URL('../tests/fixtures/application-catalog-2026-09-08.json', import.meta.url), 'utf8'));
  assert.equal(catalog.fixture_only, true);
  await restoreApplicationCatalog(db, catalog);
  await migration('20260908164431_post_visit_review_requests.sql');
  await migration('20260913111203_per_restaurant_waha_channels.sql');
  await migration('20260913111211_waha_review_recheck.sql');
  await migration('20261017120000_review_provider_states.sql');
  await db.exec('alter role service_role bypassrls');

  await seedReviews(db);
  await addReviewVisit(db, { hours: 1 });
  assert.equal((await requestRow(db)).status, 'scheduled');
  assert.equal(await claimReview(db), undefined);
  await seedReviews(db);
  await db.query('update automatizaciones_config set review_delay_hours=2 where restaurante_id=$1', [I.restaurant]);
  await addReviewVisit(db, { hours: 1 });
  assert.equal(Number((await db.query('select extract(epoch from (q.scheduled_for-r.inicio_at)) n from visit_review_requests q join reservas r on r.id=q.reserva_id')).rows[0].n), 7200);
  assert.equal(await claimReview(db), undefined);
  checks.push('No claim before the existing due time: 3 hours by default or 2 hours when configured, measured from visit start.');

  await seedReviews(db);
  await addReviewVisit(db, { attended: false });
  assert.equal(await claimReview(db), undefined);
  await seedReviews(db);
  await addReviewVisit(db, { state: 'cancelada' });
  assert.equal(await claimReview(db), undefined);
  await seedReviews(db);
  await addReviewVisit(db);
  await db.query('update cliente_comunicaciones_consentimiento set review_whatsapp=false where cliente_id=$1', [I.customer]);
  assert.equal(await claimReview(db), undefined);
  checks.push('No claim without attendance, after cancellation, or after review consent is revoked.');

  await seedReviews(db);
  await addReviewVisit(db);
  const simultaneousClaims = await Promise.all([claimReview(db), claimReview(db)]);
  assert.equal(simultaneousClaims.filter(Boolean).length, 1);
  let event = simultaneousClaims.find(Boolean);
  assert.ok(event);
  assert.equal((await checkDelivery(db, event)).allowed, true);
  assert.equal(await finishDelivery(db, event, 'sent', 'wamid.fixture-a'), true);
  let q = await requestRow(db);
  assert.equal(q.status, 'accepted');
  assert.ok(q.accepted_at);
  assert.equal(q.sent_at, null);
  assert.equal((await queue()).status, 'delivered'); // job completed, not message delivered
  assert.equal((await message('wamid.fixture-a')).status, 'accepted');
  await reviewActor(db);
  await db.query('update reservas set estado=$1 where id=$2', ['completada', I.reservation]);
  assert.equal((await requestRow(db)).status, 'accepted');
  await assert.rejects(reviewAction(db, 'prepare'), /REVIEW_ALREADY_SENT/);
  assert.equal(await claimReview(db), undefined);
  checks.push('Provider ACK is accepted only; queue completion and repeated attendance never resend.');

  await reviewActor(db, null, 'service_role');
  assert.equal(await status('wamid.fixture-a', 'read'), 'recorded');
  assert.equal(await status('wamid.fixture-a', 'delivered'), 'recorded');
  assert.equal(await status('wamid.fixture-a', 'sent'), 'recorded');
  assert.equal(await status('wamid.fixture-a', 'failed'), 'recorded');
  assert.equal(await status('wamid.fixture-a', 'read'), 'recorded');
  q = await requestRow(db);
  assert.equal(q.status, 'read');
  assert.ok(q.read_at && q.delivered_at && q.sent_at);
  await reviewActor(db);
  const listed = (await db.query('select list_visit_review_requests($1) result', [I.restaurant])).rows[0].result.requests[0];
  assert.equal(listed.status, 'read');
  assert.ok(listed.read_at);
  await reviewActor(db, I.otherUser);
  await assert.rejects(db.query('select list_visit_review_requests($1)', [I.restaurant]), /REVIEW_ACCESS_DENIED/);
  await assert.rejects(db.query('select record_review_provider_status($1,$2,now())', ['wamid.fixture-a', 'failed']), /permission denied/);
  checks.push('Signed status path is service-only; duplicates and out-of-order callbacks never regress panel state.');

  await reviewActor(db);
  await addReviewVisit(db, { id: randomUUID() });
  const differentVisit = await claimReview(db);
  assert.ok(differentVisit);
  assert.equal((await checkDelivery(db, differentVisit)).allowed, true);
  await assert.rejects(finishDelivery(db, differentVisit, 'sent', 'wamid.fixture-a'), /REVIEW_PROVIDER_BINDING_MISMATCH/);
  checks.push('A provider message ID already bound to one request cannot be assigned to another visit.');

  await seedReviews(db);
  await addReviewVisit(db);
  event = await claimReview(db);
  assert.equal((await checkDelivery(db, event)).allowed, true);
  assert.equal(await status('wamid.fixture-early', 'delivered'), 'staged');
  assert.equal(await finishDelivery(db, event, 'sent', 'wamid.fixture-early'), true);
  q = await requestRow(db);
  assert.equal(q.status, 'delivered');
  assert.equal(q.sent_at, null);
  assert.ok(q.delivered_at && q.accepted_at);
  assert.equal((await message('wamid.fixture-early')).request_id, q.id);
  assert.equal((await message('wamid.fixture-early')).restaurante_id, I.restaurant);
  checks.push('A callback arriving before ACK persistence stages and binds to the correct request and restaurant.');

  await seedReviews(db);
  await addReviewVisit(db);
  event = await claimReview(db);
  assert.equal((await checkDelivery(db, event)).allowed, true);
  assert.equal(await finishDelivery(db, event, 'sent', 'wamid.fixture-fail'), true);
  assert.equal(await status('wamid.fixture-fail', 'failed'), 'recorded');
  assert.equal((await requestRow(db)).status, 'failed');
  assert.equal(await status('wamid.fixture-fail', 'sent'), 'recorded');
  assert.equal((await requestRow(db)).status, 'failed');
  await reviewActor(db);
  await assert.rejects(reviewAction(db, 'prepare'), /REVIEW_ALREADY_SENT/);
  checks.push('Confirmed failure is visible, and a late weaker callback cannot reopen a send.');

  await seedReviews(db);
  await addReviewVisit(db);
  event = await claimReview(db);
  assert.equal((await checkDelivery(db, event)).allowed, true);
  assert.equal(await finishDelivery(db, event, 'sent', 'wamid.fixture-order'), true);
  const currentSecond = Math.floor(Date.now() / 1000);
  assert.equal(await status('wamid.fixture-order', 'sent', currentSecond), 'recorded');
  assert.equal(await status('wamid.fixture-order', 'failed', currentSecond - 60), 'recorded');
  assert.equal((await requestRow(db)).status, 'sent');
  checks.push('A delayed failure older than a verified sent event cannot replace newer success evidence.');

  await seedReviews(db);
  await addReviewVisit(db);
  event = await claimReview(db);
  assert.equal((await checkDelivery(db, event)).allowed, true);
  assert.equal(await finishDelivery(db, event, 'uncertain', null, 'fixture_timeout'), true);
  assert.equal((await requestRow(db)).status, 'uncertain');
  assert.equal(await claimReview(db), undefined);
  checks.push('An uncertain provider outcome is held without automatic retry.');

  console.log(JSON.stringify({ status: 'passed', checks }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', message: error.message, code: error.code, stack: error.stack }));
  process.exitCode = 1;
} finally { await db.close(); }
