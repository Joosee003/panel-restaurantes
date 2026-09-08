import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../tests/sql/node_modules/@electric-sql/pglite/dist/index.js';
import { pgcrypto } from '../tests/sql/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js';
import { uuid_ossp } from '../tests/sql/node_modules/@electric-sql/pglite/dist/contrib/uuid_ossp.js';
import { restoreApplicationCatalog } from './recovery-catalog.mjs';
import { checkReviewSchema } from './review-schema-checks.mjs';
const db=new PGlite({extensions:{pgcrypto,uuid_ossp}});
try {
 const catalog=JSON.parse(await readFile(new URL('../tests/fixtures/application-catalog-2026-09-08.json',import.meta.url),'utf8'));
 assert.equal(catalog.fixture_only,true);
 const restored=await restoreApplicationCatalog(db,catalog);
 await db.exec(await readFile(new URL('../docs/sql/post-visit-reviews.sql',import.meta.url),'utf8'));
 const checks=await checkReviewSchema(db);
 console.log(JSON.stringify({status:'passed',restored,checks},null,2));
} catch(error) { console.error(JSON.stringify({status:'failed',message:error.message,code:error.code,where:error.where,stack:error.stack}));process.exitCode=1; }
finally {await db.close();}
