import assert from 'node:assert/strict';

export const ident = (value) => `"${String(value).replaceAll('"', '""')}"`;
export const qualified = (schema, name) => `${ident(schema)}.${ident(name)}`;
const roleName = (name) => name === 'PUBLIC' ? 'PUBLIC' : ident(name);
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

// Only accepts the catalog format produced by recovery-catalog.sql. Callers
// must create their own empty, disposable database; this is not a migration.
export async function restoreApplicationCatalog(db, catalog) {
  assert.equal(catalog.format_version, 2, 'Unsupported catalog format');
  const { rows } = await db.query("select count(*)::int n from pg_tables where schemaname='public'");
  assert.equal(rows[0].n, 0, 'Refuse to restore over a populated application schema');
  let stage = 'roles';
  const exec = async (sql, label) => {
    stage = label;
    try { await db.exec(sql); }
    catch (error) {
      // Do not print query text, function bodies or restored row contents.
      throw new Error(`${label}: ${error.code || 'SQL_ERROR'} ${error.message}`, { cause: error });
    }
  };
  const roles = new Set(['anon','authenticated','service_role','supabase_admin',
    'supabase_auth_admin','dashboard_user','authenticator']);
  for (const item of [...catalog.tables,...catalog.functions,...catalog.schemas]) roles.add(item.owner);
  for (const item of [...(catalog.table_grants||[]),...(catalog.function_grants||[])]) roles.add(item.grantee);
  for (const role of roles) {
    if (!role || role === 'PUBLIC') continue;
    await exec(`do $$ begin if not exists(select 1 from pg_roles where rolname=${literal(role)})
      then create role ${ident(role)} nologin; end if; end $$`, `role ${role}`);
  }
  await exec('set check_function_bodies=false', 'defer function body validation');
  for (const schema of catalog.schemas) {
    await exec(`create schema if not exists ${ident(schema.name)}`, `schema ${schema.name}`);
    await exec(`alter schema ${ident(schema.name)} owner to ${ident(schema.owner)}`, `schema owner ${schema.name}`);
  }
  await exec('create extension if not exists pgcrypto with schema extensions', 'extension pgcrypto');
  await exec('create extension if not exists "uuid-ossp" with schema extensions', 'extension uuid-ossp');
  await exec('set search_path=public,extensions', 'restore search path');
  for (const item of catalog.enums || []) {
    await exec(`create type ${qualified(item.schema,item.name)} as enum (${item.labels.map(literal).join(',')})`, `enum ${item.name}`);
  }
  assert.equal((catalog.sequences||[]).length, 0, 'Sequence restore requires explicit ownership and last-value support');
  for (const table of catalog.tables.filter(t=>t.kind==='r')) {
    const columns = catalog.columns.filter(c=>c.schema===table.schema && c.table===table.name);
    const declarations = columns.map(c=>{
      assert.ok(!c.identity, `Identity restore not yet implemented: ${table.name}.${c.name}`);
      let definition = `${ident(c.name)} ${c.type}`;
      if (c.generated) definition += ` generated always as (${c.default}) stored`;
      else if (c.default !== null) definition += ` default ${c.default}`;
      if (c.not_null) definition += ' not null';
      return definition;
    });
    await exec(`create table ${qualified(table.schema,table.name)} (${declarations.join(',\n')})`, `table ${table.schema}.${table.name}`);
    await exec(`alter table ${qualified(table.schema,table.name)} owner to ${ident(table.owner)}`, `owner ${table.name}`);
  }
  for (const fn of catalog.functions) {
    await exec(fn.definition, `function ${fn.schema}.${fn.name}`);
    await exec(`alter function ${qualified(fn.schema,fn.name)}(${fn.identity_args}) owner to ${ident(fn.owner)}`, `function owner ${fn.name}`);
  }
  for (const type of ['p','u','x','c','f']) {
    for (const c of catalog.constraints.filter(c=>c.type===type)) {
      await exec(`alter table ${qualified(c.schema,c.table)} add constraint ${ident(c.name)} ${c.definition}`, `constraint ${c.name}`);
    }
  }
  for (const index of catalog.indexes.filter(i=>!i.constraint_index)) {
    await exec(index.definition, `index ${index.name}`);
  }
  for (const view of catalog.views || []) {
    const options = view.options?.length ? ` with (${view.options.join(',')})` : '';
    await exec(`create view ${qualified(view.schema,view.name)}${options} as ${view.definition}`, `view ${view.name}`);
    const owner = catalog.tables.find(t=>t.schema===view.schema && t.name===view.name).owner;
    await exec(`alter view ${qualified(view.schema,view.name)} owner to ${ident(owner)}`, `view owner ${view.name}`);
  }
  for (const policy of catalog.policies) {
    await exec(`create policy ${ident(policy.policyname)} on ${qualified(policy.schemaname,policy.tablename)}
      as ${policy.permissive} for ${policy.cmd} to ${policy.roles.map(roleName).join(',')}
      ${policy.qual ? `using (${policy.qual})` : ''}
      ${policy.with_check ? `with check (${policy.with_check})` : ''}`, `policy ${policy.tablename}.${policy.policyname}`);
  }
  for (const table of catalog.tables.filter(t=>t.kind==='r')) {
    if (table.rls) await exec(`alter table ${qualified(table.schema,table.name)} enable row level security`, `RLS ${table.name}`);
    if (table.force_rls) await exec(`alter table ${qualified(table.schema,table.name)} force row level security`, `forced RLS ${table.name}`);
  }
  for (const trigger of catalog.triggers) {
    await exec(trigger.definition, `trigger ${trigger.table}.${trigger.name}`);
    if (trigger.enabled !== 'O') {
      const mode = { D:'disable', A:'enable always', R:'enable replica' }[trigger.enabled];
      assert.ok(mode, 'Unknown trigger mode');
      await exec(`alter table ${qualified(trigger.schema,trigger.table)} ${mode} trigger ${ident(trigger.name)}`, `trigger mode ${trigger.name}`);
    }
  }
  // Reset implicit PUBLIC permissions before replaying the captured ACLs.
  for (const fn of catalog.functions) {
    await exec(`revoke all on function ${qualified(fn.schema,fn.name)}(${fn.identity_args}) from public`, `function ACL reset ${fn.name}`);
  }
  for (const grant of catalog.function_grants || []) {
    await exec(`grant ${grant.privilege} on function ${qualified(grant.schema,grant.name)}(${grant.identity_args})
      to ${roleName(grant.grantee)}${grant.grantable ? ' with grant option' : ''}`, `function ACL ${grant.name}`);
  }
  for (const grant of catalog.table_grants || []) {
    await exec(`grant ${grant.privilege} on table ${qualified(grant.schema,grant.table)}
      to ${roleName(grant.grantee)}${grant.grantable ? ' with grant option' : ''}`, `table ACL ${grant.table}`);
  }
  for (const schema of catalog.schemas) {
    await exec(`revoke all on schema ${ident(schema.name)} from public`, `schema ACL reset ${schema.name}`);
    const acl = schema.acl || '';
    for (const match of acl.matchAll(/(?:\{|,)([^=,{}]*)=([^/]+)\/[^,}]+/g)) {
      const grantee = match[1] || 'PUBLIC';
      const permissions = [match[2].includes('U') && 'usage',match[2].includes('C') && 'create'].filter(Boolean);
      if (permissions.length) await exec(`grant ${permissions.join(',')} on schema ${ident(schema.name)} to ${roleName(grantee)}`, `schema ACL ${schema.name}`);
    }
  }
  await exec('set check_function_bodies=true', 'enable function body validation');
  return { tables: catalog.tables.filter(t=>t.kind==='r' && t.schema==='public').length,
    views: catalog.views.length, functions:catalog.functions.length,
    triggers:catalog.triggers.length, policies:catalog.policies.length, last_stage:stage };
}
