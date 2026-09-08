// Current application schema, captured privately using recovery-catalog.sql.
// In-memory PGlite only. No network/database URL, production keys or real rows.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { restoreApplicationCatalog } from './recovery-catalog.mjs';
import { checkApplicationFlows } from './application-schema-checks.mjs';

const [catalogPath,modulePath,reportPath] = process.argv.slice(2);
assert.ok(catalogPath && modulePath, 'Pass private catalog JSON and the PGlite module');
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
const { pgcrypto } = await import(new URL('./contrib/pgcrypto.js',pathToFileURL(resolve(modulePath))));
const { uuid_ossp } = await import(new URL('./contrib/uuid_ossp.js',pathToFileURL(resolve(modulePath))));
const catalog = JSON.parse(await readFile(catalogPath,'utf8'));
const db = new PGlite({ extensions:{pgcrypto,uuid_ossp} });
const report = { status:'incomplete',catalog_captured_at:catalog.captured_at,
  checked_at:new Date().toISOString(), engine:'PGlite 0.5.8',
  limitations:['One database connection; not a browser or concurrency test.',
    'Authentication service, HTTP extensions, Storage binaries and platform settings are outside this rehearsal.'],
  checks:[] };
try {
  report.restored = await restoreApplicationCatalog(db,catalog);
  report.checks.push('Complete application catalog, auth.users table and identity functions restored.');
  const sqlFiles = ['harden-qr-close','connect-qr-reservation','align-manual-consumption-points',
    'preserve-qr-menu-origin','connect-qr-profitability','connect-room-capacity'];
  for (const file of sqlFiles) {
    await db.exec(await readFile(new URL(`../docs/sql/${file}.sql`,import.meta.url),'utf8'));
    report.checks.push(`Applied ${file} against the captured application schema.`);
  }
  await checkApplicationFlows(db,report);
  report.status='passed';
  console.log(JSON.stringify(report,null,2));
} catch(error) {
  report.error={message:error.message,code:error.code || error.cause?.code};
  console.error(JSON.stringify({status:'failed',...report.error}));
  process.exitCode=1;
} finally {
  if(reportPath) await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  await db.close();
}
