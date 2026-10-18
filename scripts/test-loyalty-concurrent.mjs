// Disposable PostgreSQL instance and synthetic fixtures. No hosted credentials.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import pg from 'pg';
import { restoreApplicationCatalog } from './recovery-catalog.mjs';
import { restoreStoragePolicyFixture } from './storage-policy-fixture.mjs';
import { reviewActor } from './review-schema-checks.mjs';

const bin = process.env.GH_LOCAL_POSTGRES_BIN;
if (!bin) throw new Error('Set GH_LOCAL_POSTGRES_BIN to the local PostgreSQL bin directory');
const cluster = await mkdtemp(path.join(tmpdir(), 'gastrohelp-loyalty-pg-'));
const data = path.join(cluster, 'data');
const clients = [];
let server;
const ids = {
  owner: 'a1000000-0000-4000-8000-000000000001',
  client: 'a1000000-0000-4000-8000-000000000002',
  restaurant: 'a2000000-0000-4000-8000-000000000001',
  customer: 'a3000000-0000-4000-8000-000000000001',
  reward: 'a4000000-0000-4000-8000-000000000001',
};
const exec = (exe, args) => new Promise((resolve, reject) => {
  const child = spawn(path.join(bin, `${exe}.exe`), args, { env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` }, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${exe}: ${stderr.slice(-1000)}`)));
});
const freePort = () => new Promise((resolve, reject) => {
  const socket = net.createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); });
});
const wrap = (client) => ({ query: (...args) => client.query(...args), exec: (sql) => client.query(sql) });

try {
  const port = await freePort();
  await exec('initdb', ['-D', data, '--auth=trust', '--username=postgres', '--locale=C', '--encoding=UTF8']);
  server = spawn(path.join(bin, 'postgres.exe'), ['-D', data, '-c', 'listen_addresses=127.0.0.1', '-c', `port=${port}`, '-c', 'max_connections=10', '-c', 'shared_buffers=16MB'], { env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` }, stdio: ['ignore', 'ignore', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Local PostgreSQL startup timed out')), 15000);
    let log = '';
    server.on('error', reject);
    server.stderr.on('data', (chunk) => { log += chunk; if (log.includes('ready to accept connections')) { clearTimeout(timeout); resolve(); } });
  });
  for (let i = 0; i < 3; i++) {
    const client = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', ssl: false, query_timeout: 10000 });
    await client.connect(); clients.push(client);
  }
  const [a,b,observer] = clients.map(wrap);
  const catalog = JSON.parse(await readFile(new URL('../tests/fixtures/application-catalog-2026-09-08.json', import.meta.url), 'utf8'));
  assert.equal(catalog.fixture_only, true);
  await restoreApplicationCatalog(a, catalog);
  await restoreStoragePolicyFixture(a);
  const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter((name) => name >= '20260908164431').sort();
  for (const name of migrations) await a.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  await a.exec('alter role service_role bypassrls; alter table auth.users disable trigger user');
  await a.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [ids.owner,'owner@example.invalid',ids.client,'client@example.invalid']);
  await a.exec('alter table auth.users enable trigger user');
  await reviewActor(a,null,'service_role');
  await a.query('insert into restaurantes(id,nombre,slug,owner_id) values($1,$2,$3,$4)',[ids.restaurant,'Club PG concurrente','club-pg-concurrent',ids.owner]);
  await a.query('insert into usuarios_restaurantes(user_id,restaurante_id) values($1,$2)',[ids.owner,ids.restaurant]);
  await a.query("insert into restaurante_modulos(restaurante_id,estado,reservas,clientes,fidelizacion) values($1,'activo',true,true,true)",[ids.restaurant]);
  await a.query("insert into clientes(id,restaurante_id,nombre,telefono,puntos_totales) values($1,$2,'Cliente sintético','600 000 099',100)",[ids.customer,ids.restaurant]);
  await a.query("insert into premios_puntos(id,restaurante_id,nombre,puntos_requeridos,activo) values($1,$2,'Premio sintético',30,true)",[ids.reward,ids.restaurant]);
  await a.query('insert into puntos_saldos(cliente_id,restaurante_id,puntos) values($1,$2,100)',[ids.customer,ids.restaurant]);
  await a.exec('reset role');
  await a.query('update auth.users set phone=$2,phone_confirmed_at=now() where id=$1',[ids.client,'+34600000099']);
  await reviewActor(a,ids.client);
  const joined = (await a.query("select club_join_restaurant('club-pg-concurrent',null,'club-loyalty-2026-10-04') result")).rows[0].result;
  const request = (await a.query("select club_create_redemption('club-pg-concurrent',$1) result",[ids.reward])).rows[0].result;
  await reviewActor(a,ids.owner);
  await reviewActor(b,ids.owner);
  assert.notEqual((await a.query('select pg_backend_pid() id')).rows[0].id,(await b.query('select pg_backend_pid() id')).rows[0].id);
  await a.exec('begin');
  const first = (await a.query('select rpc_confirmar_canje_qr($1,$2)',[request.token,ids.restaurant])).rows;
  let completed = false;
  const second = b.query('select rpc_confirmar_canje_qr($1,$2)',[request.token,ids.restaurant]).then(() => ({ok:true}),error => ({ok:false,error:error.message})).finally(()=>{completed=true;});
  // Confirm actual lock contention through the third independent connection.
  let locked = false;
  for (let attempt = 0; attempt < 100 && !completed; attempt++) {
    const waiting = await observer.query("select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock'");
    if (waiting.rows[0].n >= 1) { locked = true; break; }
    await new Promise((resolve)=>setTimeout(resolve,20));
  }
  assert.ok(locked,'Second connection must wait for the first commit');
  await a.exec('commit');
  const result = await second;
  assert.equal(first.length,1);
  assert.equal(result.ok,false);
  assert.match(result.error,/REDEMPTION_TOKEN_USED|REDEMPTION_NOT_PENDING/);
  const balance = (await observer.query('select puntos from puntos_saldos where cliente_id=$1 and restaurante_id=$2',[ids.customer,ids.restaurant])).rows[0].puntos;
  const movements = (await observer.query("select count(*)::int n from puntos_movimientos where referencia=$1",[`canje-confirmado:${request.redemptionId}`])).rows[0].n;
  assert.equal(balance,70);
  assert.equal(movements,1);
  if (process.env.GH_LOYALTY_ROLLBACK_SQL) {
    await a.exec('reset role');
    await a.exec(await readFile(process.env.GH_LOYALTY_ROLLBACK_SQL,'utf8'));
    const restored = (await observer.query("select pg_get_functiondef('public.rpc_canjear_premio(uuid,uuid,uuid)'::regprocedure) definition")).rows[0].definition;
    assert.match(restored,/Canje de premio/);
    assert.equal((await observer.query('select puntos from puntos_saldos where cliente_id=$1 and restaurante_id=$2',[ids.customer,ids.restaurant])).rows[0].puntos,70);
  }
  console.log(JSON.stringify({status:'passed',engine:'PostgreSQL',connections:3,checks:['two independent confirmation connections','one debit and one movement','second confirmation rejected'],rollbackFunctionsRestored:!!process.env.GH_LOYALTY_ROLLBACK_SQL,memberCodePresent:!!joined.memberCode}));
} catch (error) {
  console.error(JSON.stringify({status:'failed',message:error.message,code:error.code}));
  process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map((client)=>client.end()));
  if (server?.pid) { server.kill(); await new Promise((resolve)=>server.once('exit',resolve)); }
  await rm(cluster,{recursive:true,force:true,maxRetries:4,retryDelay:500}).catch(()=>undefined);
}
