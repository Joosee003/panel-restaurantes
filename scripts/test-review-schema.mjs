import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { restoreApplicationCatalog } from './recovery-catalog.mjs';
import { checkReviewSchema } from './review-schema-checks.mjs';
const db=new PGlite({extensions:{pgcrypto,uuid_ossp}});
try {
 const catalog=JSON.parse(await readFile(new URL('../tests/fixtures/application-catalog-2026-09-08.json',import.meta.url),'utf8'));
 assert.equal(catalog.fixture_only,true);
 const restored=await restoreApplicationCatalog(db,catalog);
 await db.exec(await readFile(new URL('../supabase/migrations/20260908164431_post_visit_review_requests.sql',import.meta.url),'utf8'));
 const checks=await checkReviewSchema(db);
 console.log(JSON.stringify({status:'passed',restored,checks},null,2));
} catch(error) { console.error(JSON.stringify({status:'failed',message:error.message,code:error.code,where:error.where,stack:error.stack}));process.exitCode=1; }
finally {await db.close();}
