import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {uuid_ossp} from '@electric-sql/pglite/contrib/uuid_ossp';
import {restoreApplicationCatalog} from './recovery-catalog.mjs';
import {seedReviews} from './review-schema-checks.mjs';

// Only ever creates an in-memory database from the sanitized, committed fixture.
export async function prepareReviewPreview() {
 const db = new PGlite({extensions:{pgcrypto,uuid_ossp}});
 try {
  const catalog = JSON.parse(await readFile(new URL('../tests/fixtures/application-catalog-2026-09-08.json',import.meta.url),'utf8'));
  assert.equal(catalog.fixture_only,true);
  await restoreApplicationCatalog(db,catalog);
  await db.exec(await readFile(new URL('../supabase/migrations/20260908164431_post_visit_review_requests.sql',import.meta.url),'utf8'));
  await db.exec('alter role service_role bypassrls');
  await seedReviews(db);
  await db.exec('reset role');
  const output = new URL('../tests/review-preview/public/',import.meta.url);
  await mkdir(output,{recursive:true});
  const archive = await db.dumpDataDir('gzip');
  await writeFile(new URL('database.tar.gz',output),Buffer.from(await archive.arrayBuffer()));
  console.log('Prepared isolated review database; synthetic records only.');
 } finally { await db.close(); }
}
