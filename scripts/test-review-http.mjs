// Actual Next page and API routes, with a local PostgreSQL-backed RPC transport.
// This is not browser hydration, Supabase Auth/PostgREST or a real WhatsApp test.
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {PGlite} from '../tests/sql/node_modules/@electric-sql/pglite/dist/index.js';
import {pgcrypto} from '../tests/sql/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js';
import {uuid_ossp} from '../tests/sql/node_modules/@electric-sql/pglite/dist/contrib/uuid_ossp.js';
import {restoreApplicationCatalog} from './recovery-catalog.mjs';
import {seedReviews,addReviewVisit,reviewActor,reviewAction,reviewIds as I} from './review-schema-checks.mjs';
const db=new PGlite({extensions:{pgcrypto,uuid_ossp}});let next;let api;
const allowed=new Set(['get_visit_review_link','open_visit_review_link','stop_visit_review_requests','consumir_limite_reserva_publica']);
let queue=Promise.resolve();
const bounded=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Local HTTP test timed out')),ms);})]).finally(()=>clearTimeout(timer));};
try {
 const catalog=JSON.parse(await readFile(new URL('../tests/fixtures/application-catalog-2026-09-08.json',import.meta.url),'utf8'));assert.equal(catalog.fixture_only,true);
 await restoreApplicationCatalog(db,catalog);await db.exec(await readFile(new URL('../supabase/migrations/20260908164431_post_visit_review_requests.sql',import.meta.url),'utf8'));await db.exec('alter role service_role bypassrls');
 await seedReviews(db);await addReviewVisit(db);const prepared=await reviewAction(db,'prepare');
 api=http.createServer((req,res)=>{
  queue=queue.then(async()=>{
   try {
    const name=new URL(req.url,'http://localhost').pathname.split('/').at(-1);
    if(!allowed.has(name)){res.writeHead(404);res.end();return;}
    let body='';for await(const chunk of req)body+=chunk;const args=JSON.parse(body||'{}');const keys=Object.keys(args);
    assert.ok(keys.every(k=>/^p_[a-z_]+$/.test(k)));
    await reviewActor(db,null,'service_role');
    const result=(await db.query(`select public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) result`,keys.map(k=>args[k]))).rows[0].result;
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
   }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:error.message,code:error.code}));}
  });
 });
 await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
 const apiOrigin=`http://127.0.0.1:${api.address().port}`;
 const port=3041;const origin=`http://localhost:${port}`;
 next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{
  env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:apiOrigin,NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-anon-key',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key'},stdio:['ignore','pipe','pipe']});
 let log='';next.stdout.on('data',chunk=>log+=chunk);next.stderr.on('data',chunk=>log+=chunk);
 await bounded(new Promise((resolve,reject)=>{next.on('error',reject);next.on('exit',code=>reject(new Error(`Next exited: ${code}`)));const check=()=>{if(log.includes('Ready in'))resolve();else if(next.exitCode!==null)reject(new Error(log));else setTimeout(check,100);};check();}),20000);
 const url=`${origin}/r/${prepared.token}`;
 const page=await fetch(url);assert.equal(page.status,200);
 const html=await page.text();assert.match(html,/Gracias por tu visita/);assert.match(html,/Escribir una reseña en Google/);assert.ok(!html.includes('+34600000001'));
 assert.equal(page.headers.get('referrer-policy'),'no-referrer');assert.match(page.headers.get('x-robots-tag'),/noindex/);
 await reviewActor(db,null,'service_role');
 let q=(await db.query('select * from visit_review_requests')).rows[0];assert.equal(q.google_opened_at,null);
 assert.equal((await fetch(`${origin}/api/public/review-requests/${prepared.token}`)).status,405);
 const post=(action,source=origin)=>{const form=new FormData();form.set('action',action);return fetch(`${origin}/api/public/review-requests/${prepared.token}`,{method:'POST',headers:{Origin:source},body:form});};
 assert.equal((await post('google','https://untrusted.invalid')).status,403);
 const opened=await post('google');assert.equal(opened.status,200);assert.equal((await opened.json()).url,'https://g.page/r/test-review/review');
 q=(await db.query('select * from visit_review_requests')).rows[0];assert.ok(q.google_opened_at);assert.equal(q.sent_at,null);
 await reviewActor(db);const listed=(await db.query('select list_visit_review_requests($1) result',[I.restaurant])).rows[0].result;
 assert.ok(listed.requests[0].google_opened_at);assert.equal(listed.requests[0].confirmed,false);
 assert.equal((await post('stop')).status,200);
 assert.match(await (await fetch(url)).text(),/Ya no recibirás más peticiones/);
 assert.equal((await fetch(`${origin}/r/not-a-token`)).status,404);
 console.log(JSON.stringify({status:'passed',checks:['Actual Next HTML renders the neutral Google handoff with no customer contact data.','GET and link previews do not count as clicks; unsupported GET API and cross-origin POST are rejected.','Same-origin explicit POST stores the Google opening and the panel RPC returns it without confirmation.','Opt-out through the actual API persists and renders on the public page.','Invalid tokens return 404; page is noindex and suppresses referrers.']},null,2));
} catch(error){console.error(JSON.stringify({status:'failed',message:error.message,stack:error.stack}));process.exitCode=1;}
finally {if(next?.pid){const stopped=new Promise(resolve=>next.once('exit',resolve));next.kill('SIGTERM');await bounded(stopped,5000).catch(()=>next.kill('SIGKILL'));}if(api)await new Promise(resolve=>api.close(resolve));await db.close();}
