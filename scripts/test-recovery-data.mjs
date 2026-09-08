// Imports a PRIVATE recovery pack into a new, in-memory PGlite database.
// No credentials or database URL accepted. Never commit input data to GitHub.
import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ident,qualified,restoreApplicationCatalog } from './recovery-catalog.mjs';

const [catalogPath,dataPath,modulePath,reportPath] = process.argv.slice(2);
assert.ok(catalogPath && dataPath && modulePath,'Pass private catalog, private recovery data and PGlite module');
const moduleUrl=pathToFileURL(resolve(modulePath));
const {PGlite}=await import(moduleUrl.href);
const {pgcrypto}=await import(new URL('./contrib/pgcrypto.js',moduleUrl));
const {uuid_ossp}=await import(new URL('./contrib/uuid_ossp.js',moduleUrl));
const catalog=JSON.parse(await readFile(catalogPath,'utf8'));
const pack=JSON.parse(await readFile(dataPath,'utf8'));
const db=new PGlite({extensions:{pgcrypto,uuid_ossp}});
const report={status:'incomplete',checked_at:new Date().toISOString(),engine:'PGlite 0.5.8',
  backup_date:pack.manifest.created_at,backup_sha256:pack.backup_sha256,
  target_catalog_date:catalog.captured_at,tables:[],foreign_keys_validated:0,
  limitations:['Data-only recovery into the captured current application schema.',
    'Authentication passwords/sessions and Storage binaries are absent from this recovery pack.',
    'Not a complete platform restore or evidence of recovery of data created after the backup.']};
let stage='restore empty application schema';
try {
  await restoreApplicationCatalog(db,catalog);
  const selected=[{schema:'auth',table:'users',rows:pack.auth_users},
    ...Object.entries(pack.data).map(([table,rows])=>({schema:'public',table,rows}))];
  assert.equal(Object.keys(pack.data).length,pack.manifest.public_tables);
  assert.equal(Object.values(pack.data).reduce((sum,rows)=>sum+rows.length,0),pack.manifest.public_rows);
  // Import must not replay visit, points, automation or invitation triggers.
  await db.exec('begin; set local session_replication_role=replica');
  for(const entry of selected) {
    stage=`import ${entry.schema}.${entry.table}`;
    if(!entry.rows.length) {report.tables.push({schema:entry.schema,table:entry.table,rows:0});continue;}
    const keys=Object.keys(entry.rows[0]);
    for(const row of entry.rows) assert.deepEqual(Object.keys(row).sort(),[...keys].sort(),'Inconsistent row shape');
    const schemaColumns=catalog.columns.filter(c=>c.schema===entry.schema && c.table===entry.table);
    for(const key of keys) assert.ok(schemaColumns.some(c=>c.name===key),'Backup column absent from target schema');
    const writable=keys.filter(k=>!schemaColumns.find(c=>c.name===k).generated);
    const table=qualified(entry.schema,entry.table);
    const names=writable.map(ident).join(',');
    await db.query(`insert into ${table} (${names}) select ${names} from jsonb_populate_recordset(null::${table},$1::jsonb)`,[JSON.stringify(entry.rows)]);
    report.tables.push({schema:entry.schema,table:entry.table,rows:entry.rows.length});
  }
  await db.exec('commit');
  // Recreate each FK to actually validate all imported rows. Merely inspecting
  // convalidated would miss invalid rows loaded with replication triggers off.
  for(const c of catalog.constraints.filter(c=>c.type==='f')) {
    stage=`validate foreign key ${c.name}`;
    await db.exec(`alter table ${qualified(c.schema,c.table)} drop constraint ${ident(c.name)};
      alter table ${qualified(c.schema,c.table)} add constraint ${ident(c.name)} ${c.definition}`);
    report.foreign_keys_validated++;
  }
  for(const entry of selected) {
    stage=`compare ${entry.schema}.${entry.table}`;
    const table=qualified(entry.schema,entry.table);
    assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,entry.rows.length);
    if(!entry.rows.length)continue;
    const names=Object.keys(entry.rows[0]).map(ident).join(',');
    // Cast expected JSON through the same column types before exact comparison,
    // so timestamp formatting/JSON object-key ordering do not create false errors.
    const differences=(await db.query(`with expected as (
      select to_jsonb(r) value from (select ${names} from jsonb_populate_recordset(null::${table},$1::jsonb)) r
    ), actual as (select to_jsonb(r) value from (select ${names} from ${table}) r)
    select count(*)::int n from ((select value from expected except all select value from actual)
      union all (select value from actual except all select value from expected)) d`,[JSON.stringify(entry.rows)])).rows[0].n;
    assert.equal(differences,0,'Imported values differ from backup');
  }
  report.public_tables=Object.keys(pack.data).length;
  report.public_rows=pack.manifest.public_rows;
  report.auth_identity_rows=pack.auth_users.length;
  report.status='passed';
  console.log(JSON.stringify({status:report.status,public_tables:report.public_tables,
    public_rows:report.public_rows,auth_identity_rows:report.auth_identity_rows,
    foreign_keys_validated:report.foreign_keys_validated}));
}catch(error){
  report.error={stage,code:error.code || error.cause?.code || 'ASSERTION_FAILED'};
  console.error(JSON.stringify({status:'failed',...report.error}));
  process.exitCode=1;
}finally{
  if(reportPath)await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  await db.close();
}
