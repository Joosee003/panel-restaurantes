// Publish schema-only fixtures; never publish the private catalog or backup data.
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
const [input,output]=process.argv.slice(2);
assert.ok(input && output,'Pass private schema-only catalog and fixture destination');
const source=await readFile(input,'utf8');
const catalog=JSON.parse(source);
assert.equal(catalog.format_version,2);
for(const forbidden of ['data','auth_users','passwords','sessions','storage_objects']) {
  assert.equal(Object.hasOwn(catalog,forbidden),false,`Refuse a catalog containing ${forbidden}`);
}
const maps={emails:new Map(),urls:new Map(),identifiers:new Map()};
const replace=(map,key,value)=>{if(!map.has(key))map.set(key,value(map.size+1));return map.get(key);};
let sanitized=JSON.stringify(catalog)
  .replace(/[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    value=>replace(maps.emails,value,n=>`fixture-account-${n}@example.invalid`))
  .replace(/https?:\/\/[^\s'"\\<>]+/g,
    value=>replace(maps.urls,value,n=>`https://outbound-disabled.example.invalid/${n}`))
  .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    value=>replace(maps.identifiers,value,n=>`d1000000-0000-4000-8000-${String(n).padStart(12,'0')}`))
  .replaceAll('hispanos-grill','fixture-reputation-restaurant');
assert.ok(!/eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(sanitized),'Credential-like JWT detected');
assert.ok(!/\b(?:sbp_|sb_secret_|sk_live_|sk_test_)[A-Za-z0-9_-]{12,}/.test(sanitized),'Credential-like token detected');
const fixture=JSON.parse(sanitized);
fixture.fixture_only=true;
fixture.source_sha256=createHash('sha256').update(source).digest('hex');
fixture.redactions=Object.fromEntries(Object.entries(maps).map(([key,map])=>[key,map.size]));
fixture.scope+=' Fixture only: contact literals, outbound URLs and embedded record identifiers replaced; no real rows.';
await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(fixture,null,2)+'\n');
console.log(JSON.stringify({fixture_only:true,redactions:fixture.redactions,
  tables:fixture.tables.length,functions:fixture.functions.length}));
