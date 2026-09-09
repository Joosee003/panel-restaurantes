import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {NextRequest} from 'next/server.js';
import {GASTROHELP_PHONE_NUMBER_ID} from '../lib/whatsapp/channel.mjs';
import {prepareReviewWebhook} from '../lib/reviews/n8n-review-contract.mjs';

const require=createRequire(import.meta.url);
const db=new PGlite();
const a='72000000-0000-4000-8000-000000000001',b='72000000-0000-4000-8000-000000000002';
await db.exec(`create role anon; create role authenticated; create role service_role;
 create table restaurantes(id uuid primary key,nombre text);
 create table restaurante_modulos(restaurante_id uuid primary key,chatbot boolean,estado text);
 create table chatbot_sessions(expires_at timestamptz,locked_until timestamptz);
 insert into restaurantes values('${a}','Local A'),('${b}','Local B');
 insert into restaurante_modulos values('${a}',true,'activo'),('${b}',true,'activo');`);
await db.exec(readFileSync(new URL('../supabase/migrations/20260909161858_shared_whatsapp_inbox.sql',import.meta.url),'utf8'));
await db.exec(`insert into whatsapp_restaurant_routes(restaurante_id,routing_code,enabled,delivery_mode,pilot_phones)
 values('${a}','local-a',true,'live','{}'),('${b}','local-b',true,'pilot','{+447700900124}');`);
after(()=>db.close());
const engineCalls=[];
let engineResult={ok:true,reply:'Respuesta del motor',suppressDelivery:false};
const rpc=async(name,args)=>{
 const keys=Object.keys(args);
 try {
  const invocation=`public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')})`;
  const result=await db.query(name==='list_whatsapp_restaurants'?`select to_jsonb(r) result from ${invocation} r`:`select ${invocation} result`,Object.values(args));
  return {data:name==='list_whatsapp_restaurants'?result.rows.map(r=>r.result):result.rows[0]?.result,error:null};
 } catch(error) {return {data:null,error};}
};
function compile(file,imports={}) {
 const compiled={exports:{}};
 const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name=>imports[name]||require(name),compiled,compiled.exports);
 return compiled.exports;
}
const routing=compile('../lib/chatbot/shared-routing.ts');
const {POST}=compile('../app/api/chatbot/inbox/route.ts',{
 '../../../lib/supabaseAdmin':{getSupabaseAdmin:()=>({rpc})},
 '../../../../lib/chatbot/shared-routing':routing,
 '../../../../lib/whatsapp/channel.mjs':{GASTROHELP_PHONE_NUMBER_ID},
 '../messages/route':{POST:async request=>{engineCalls.push(await request.json());return Response.json(engineResult);}},
});
process.env.N8N_CHATBOT_WEBHOOK_SECRET='isolated-local-fixture';
let id=0;
const payload=(text,extra={})=>({phoneNumberId:GASTROHELP_PHONE_NUMBER_ID,from:'447700900124',name:'Cliente de prueba',
 messageId:`fixture-${++id}`,timestamp:Math.floor(Date.now()/1000),text,...extra});
async function send(body,secret='isolated-local-fixture') {
 const response=await POST(new NextRequest('https://panel.invalid/api/chatbot/inbox',{
  method:'POST',headers:{'Content-Type':'application/json','X-GastroHelp-Webhook-Secret':secret},body:JSON.stringify(body),
 }));return {status:response.status,...await response.json()};
}
const reset=async()=>{await db.exec('truncate whatsapp_inbox_contacts,whatsapp_inbox_messages');engineCalls.length=0;engineResult={ok:true,reply:'Respuesta del motor',suppressDelivery:false};};
test('unidentified clients and invalid codes never fall back to a restaurant',async()=>{
 await reset(); let result=await send(payload('hola'));assert.match(result.reply,/RESERVAR local-a/);assert.equal(engineCalls.length,0);
 await send(payload('RESERVAR local-a'));assert.equal(engineCalls[0].restaurantId,a);
 result=await send(payload('RESERVAR desconocido'));assert.match(result.reply,/Con qué restaurante|con qué restaurante/);
 await send(payload('2'));assert.equal(engineCalls.length,1);
});
test('same number and customer switch A → B with isolated engine calls, server mode and named replies',async()=>{
 await reset();
 let result=await send(payload('RESERVAR local-a',{restaurantId:b,mode:'pilot'}));
 assert.equal(result.restaurantId,a);assert.match(result.reply,/^\*Local A\*/);assert.equal(engineCalls[0].mode,'live');
 await send(payload('reservar'));assert.equal(engineCalls.at(-1).restaurantId,a);
 result=await send(payload('RESERVAR local-b',{mode:'live'}));assert.equal(result.restaurantId,b);assert.match(result.reply,/^\*Local B\*/);
 assert.equal(engineCalls.at(-1).mode,'pilot');assert.equal(engineCalls.at(-1).text,'reiniciar');
 await send(payload('3'));assert.equal(engineCalls.at(-1).restaurantId,b);assert.equal(engineCalls.at(-1).from,'447700900124');
});
test('selection menu, unknown quoted messages and expired context demand a new restaurant',async()=>{
 await reset();await send(payload('RESERVAR local-a'));
 await send(payload('si',{replyToMessageId:'wamid.unknown'}));assert.equal(engineCalls.length,1);
 await send(payload('RESERVAR local-b'));await send(payload('CAMBIAR RESTAURANTE'));await send(payload('si'));assert.equal(engineCalls.length,2);
 await send(payload('RESERVAR local-a'));await db.exec("update whatsapp_inbox_contacts set expires_at=now()-interval '1 minute'");
 await send(payload('si'));assert.equal(engineCalls.length,3);
});
test('disabled modules and private pilots never appear or receive another customer',async()=>{
 await reset();let result=await send(payload('RESERVAR local-b',{from:'447700900125'}));
 assert.doesNotMatch(result.reply,/Local B/);assert.equal(engineCalls.length,0);
 await db.exec(`update restaurante_modulos set chatbot=false where restaurante_id='${a}'`);
 result=await send(payload('RESERVAR local-a'));assert.doesNotMatch(result.reply,/Local A/);assert.equal(engineCalls.length,0);
 await db.exec(`update restaurante_modulos set chatbot=true where restaurante_id='${a}'`);
});
test('one Meta message is processed once even after selecting a different restaurant',async()=>{
 await reset();const message=payload('RESERVAR local-a');await send(message);
 await send(payload('RESERVAR local-b'));const result=await send({...message,text:'si'});
 assert.equal(result.duplicate,true);assert.equal(result.suppressDelivery,true);assert.equal(engineCalls.length,2);
 assert.equal((await send({...message,from:'447700900125'})).duplicate,true);
});
test('a second message cannot switch restaurants while an earlier turn holds the contact lock',async()=>{
 await reset();const message=payload('RESERVAR local-a');
 const args={p_phone_number_id:message.phoneNumberId,p_contact_phone:'+'+message.from,p_message_id:message.messageId,
 p_lock_token:crypto.randomUUID(),p_test:false,p_message_at:new Date(message.timestamp*1000).toISOString()};
 assert.equal((await rpc('begin_whatsapp_inbox_turn',args)).data.status,'acquired');
 assert.equal((await send(payload('RESERVAR local-b'))).status,409);assert.equal(engineCalls.length,0);
 await rpc('fail_whatsapp_inbox_turn',Object.fromEntries(Object.entries(args).filter(([key])=>key!=='p_message_at')));
});
test('late old messages cannot restore a previous restaurant or execute a booking confirmation',async()=>{
 await reset();await send(payload('RESERVAR local-b'));
 const result=await send(payload('si',{timestamp:Math.floor(Date.now()/1000)-60}));
 assert.equal(result.suppressDelivery,true);assert.equal(engineCalls.length,1);
});
test('routing rehearsals neither send messages nor touch live conversations',async()=>{
 await reset();await send(payload('RESERVAR local-a'));
 const result=await send(payload('RESERVAR local-b',{mode:'test'}));assert.equal(result.restaurantId,b);
 assert.equal(result.suppressDelivery,true);assert.equal(result.preview.configuredMode,'pilot');assert.equal(engineCalls.length,1);
 await send(payload('2'));assert.equal(engineCalls.at(-1).restaurantId,a);
});
test('failed processing clears the selected restaurant and suppresses stale continuation',async()=>{
 await reset();await send(payload('RESERVAR local-a'));engineResult={ok:false};
 assert.equal((await send(payload('RESERVAR local-b'))).status,500);engineResult={ok:true,reply:'ok'};
 await send(payload('si'));assert.equal(engineCalls.length,2);
});
test('the inbox rejects missing authentication, wrong sender channel and malformed input',async()=>{
 await reset();assert.equal((await send(payload('hola'),'wrong')).status,401);
 for(const extra of [{phoneNumberId:'other'},{timestamp:0},{from:'bad'},{text:''},{messageId:'x'.repeat(191)}])
  assert.equal((await send(payload('hola',extra))).status,400);
 assert.equal(engineCalls.length,0);
});
test('routing tables and entry functions are inaccessible to browser roles',async()=>{
 for(const role of ['anon','authenticated']) {
  for(const table of ['whatsapp_restaurant_routes','whatsapp_inbox_contacts','whatsapp_inbox_messages']) {
   const {rows}=await db.query('select has_table_privilege($1,$2,\'SELECT\') allowed',[role,table]);assert.equal(rows[0].allowed,false);
  }
  const {rows}=await db.query("select has_function_privilege($1,'public.list_whatsapp_restaurants(text)','EXECUTE') allowed",[role]);
  assert.equal(rows[0].allowed,false);
 }
});
test('review requests for two restaurants use the same sender with their own name and token',()=>{
 const settings={enabled:true,templateApproved:true,restaurantIds:[a,b],phoneNumberId:GASTROHELP_PHONE_NUMBER_ID,templateName:'fixture_review',language:'es'};
 const outputs=[a,b].map((restaurantId,i)=>{
  const token=`76000000-0000-4000-8000-00000000000${i+1}`;
  const eventId='visit.review_request:'+token;
  return prepareReviewWebhook({body:{event:'visit.review_request',automationEventId:eventId,restaurantId,
    deliveryMode:'live',whatsappAllowed:true,review:{name:'Jose',phone:'447700900124',restaurantName:i?'Local B':'Local A',token}},
    headers:{'x-gastrohelp-automation-event':eventId,'x-gastrohelp-delivery-mode':'live'}},settings);
 });
 assert.ok(outputs.every(o=>o.send&&o.phoneNumberId===GASTROHELP_PHONE_NUMBER_ID));
 assert.notEqual(outputs[0].restaurantName,outputs[1].restaurantName);assert.notEqual(outputs[0].token,outputs[1].token);
});
