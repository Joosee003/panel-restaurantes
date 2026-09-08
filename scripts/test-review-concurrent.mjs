// Fresh private Unix-socket PostgreSQL cluster; synthetic rows only, no network or live credentials.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from '../tests/sql/node_modules/pg/lib/index.js';
import {restoreApplicationCatalog} from './recovery-catalog.mjs';
import {seedReviews,addReviewVisit,reviewActor,reviewAction,requestRow,claimReview,checkDelivery,finishDelivery,reviewIds as I} from './review-schema-checks.mjs';
if(process.getuid?.()===0) {
 const child=spawnSync(process.execPath,process.argv.slice(1),{uid:65534,gid:65534,stdio:'inherit',env:process.env});
 if(child.error) console.error(JSON.stringify({status:'blocked',message:child.error.message}));
 process.exit(child.status??1);
}
const bin=path.resolve('tests/sql/node_modules/@embedded-postgres/linux-x64/native/bin');
const cluster=await mkdtemp(path.join(tmpdir(),'gastrohelp-review-concurrent-'));
const data=path.join(cluster,'data');const clients=[];let server;
const bounded=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Local PostgreSQL test timed out')),ms);})]).finally(()=>clearTimeout(timer));};
const command=(exe,args)=>new Promise((resolve,reject)=>{const c=spawn(exe,args,{stdio:['ignore','ignore','pipe']});let error='';c.stderr.on('data',v=>error+=v);c.on('error',reject);c.on('exit',code=>code===0?resolve():reject(new Error(error)));});
async function connect(){const c=new pg.Client({host:cluster,port:5432,user:'postgres',database:'postgres',ssl:false,query_timeout:10000});await c.connect();clients.push(c);await c.query("set statement_timeout='7s'; set lock_timeout='5s'; set search_path=public,extensions");return {query:(...args)=>c.query(...args),exec:sql=>c.query(sql)};}
try {
 await bounded(command(path.join(bin,'initdb'),['-D',data,'--auth=trust','--username=postgres','--locale=C','--encoding=UTF8']),20000);
 server=spawn(path.join(bin,'postgres'),['-D',data,'-c','listen_addresses=','-c',`unix_socket_directories=${cluster}`,'-c','unix_socket_permissions=0700','-c','max_connections=10','-c','shared_buffers=16MB'],{stdio:['ignore','ignore','pipe']});
 await bounded(new Promise((resolve,reject)=>{let log='';server.on('error',reject);server.stderr.on('data',chunk=>{log+=chunk;if(log.includes('ready to accept connections'))resolve();});}),10000);
 const a=await connect(),b=await connect(),observer=await connect();
 const catalog=JSON.parse(await readFile(new URL('../tests/fixtures/application-catalog-2026-09-08.json',import.meta.url),'utf8'));assert.equal(catalog.fixture_only,true);
 await restoreApplicationCatalog(a,catalog);await a.exec(await readFile(new URL('../docs/sql/post-visit-reviews.sql',import.meta.url),'utf8'));await a.exec('alter role service_role bypassrls');
 const backend=(await b.query('select pg_backend_pid() id')).rows[0].id;
 const reset=async()=>{await a.exec('rollback');await b.exec('rollback');await seedReviews(a);await addReviewVisit(a);await reviewActor(b);};
 async function waiting(operation,release){
  let done=false;const pending=operation().then(value=>({value}),error=>({error})).finally(()=>done=true);
  const until=Date.now()+3000;let locked=false;
  while(Date.now()<until&&!done){const r=(await observer.query("select wait_event_type from pg_stat_activity where pid=$1",[backend])).rows[0];if(r?.wait_event_type==='Lock'){locked=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
  assert.ok(locked,'Second independent connection must really wait for the first transaction');await release();return pending;
 }
 const checks=[];
 await reset();await a.exec('begin');const first=await reviewAction(a,'prepare');
 let outcome=await waiting(()=>reviewAction(b,'prepare'),()=>a.exec('commit'));
 assert.equal(outcome.value.token,first.token);assert.equal((await requestRow(a)).sent_at,null);checks.push('Concurrent manual preparations share one unsent request.');
 await reset();await reviewAction(a,'prepare');await a.exec('begin');await reviewAction(a,'sent');
 outcome=await waiting(()=>reviewAction(b,'sent'),()=>a.exec('commit'));assert.match(outcome.error?.message||'',/REVIEW_ALREADY_SENT/);checks.push('Two manual send confirmations commit only once.');
 await reset();let event=await claimReview(a);await reviewActor(a);await a.exec('begin');await reviewAction(a,'confirm');await reviewActor(b,null,'service_role');
 outcome=await waiting(()=>checkDelivery(b,event),()=>a.exec('commit'));assert.equal(outcome.value.allowed,false);checks.push('Owner confirmation before the worker recheck cancels delivery.');
 await reset();event=await claimReview(a);await a.exec('begin');assert.equal((await checkDelivery(a,event)).allowed,true);await reviewActor(b);
 outcome=await waiting(()=>reviewAction(b,'prepare'),()=>a.exec('commit'));assert.match(outcome.error?.message||'',/REVIEW_DELIVERY_UNCERTAIN|REVIEW_SENDING/);checks.push('A claimed provider send excludes a simultaneous manual draft.');
 await reset();event=await claimReview(a);await reviewActor(a);await a.exec('begin');await a.query("update reservas set estado='cancelada' where id=$1",[I.reservation]);await reviewActor(b,null,'service_role');
 outcome=await waiting(()=>checkDelivery(b,event),()=>a.exec('commit'));assert.equal(outcome.value.allowed,false);checks.push('Cancellation committed during a waiting worker prevents sending.');
 await reset();event=await claimReview(a);await checkDelivery(a,event);await reviewActor(a);await a.exec('begin');await reviewAction(a,'confirm');await reviewActor(b,null,'service_role');
 outcome=await waiting(()=>finishDelivery(b,event,'sent','wamid.concurrent-fixture'),()=>a.exec('commit'));assert.equal(outcome.value,true);assert.ok((await requestRow(a)).sent_at);checks.push('A real acceptance that was already in flight remains auditable after confirmation.');
 console.log(JSON.stringify({status:'passed',engine:'PostgreSQL 17',concurrentChecks:checks},null,2));
} catch(error){console.error(JSON.stringify({status:'failed',message:error.message,code:error.code,stack:error.stack}));process.exitCode=1;}
finally {
 // Close clients before stopping PostgreSQL so shutdown cannot emit an unhandled client error.
 await Promise.allSettled(clients.map(c=>c.end()));
 if(server?.pid) server.kill('SIGINT');
}
