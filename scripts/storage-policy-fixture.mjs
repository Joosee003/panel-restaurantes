import {readFile} from 'node:fs/promises';
import {ident} from './recovery-catalog.mjs';
// Tests the deployed policy expressions, not the hosted Storage HTTP service.
// The synthetic metadata table intentionally contains only fields these policies use.
export async function restoreStoragePolicyFixture(db){
 await db.exec(`create schema if not exists storage;
 create or replace function storage.foldername(name text) returns text[] language plpgsql immutable as $$
 declare _parts text[]; begin select string_to_array(name,'/') into _parts;
 return _parts[1:array_length(_parts,1)-1]; end $$;
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated,anon,service_role;
 grant select,insert,update,delete on storage.objects to authenticated,anon,service_role;`);
 const policies=JSON.parse(await readFile(new URL('../tests/fixtures/storage-policies-2026-09-16.json',import.meta.url),'utf8'));
 for(const p of policies)await db.exec(`create policy ${ident(p.policyname)} on storage.objects as ${p.permissive} for ${p.cmd} to ${p.roles.map(ident).join(',')} ${p.qual?'using ('+p.qual+')':''} ${p.with_check?'with check ('+p.with_check+')':''}`);
}
