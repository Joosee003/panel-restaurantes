import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {NextRequest} from 'next/server.js';
import {GASTROHELP_PHONE_NUMBER_ID} from '../lib/whatsapp/channel.mjs';
import {prepareReviewWebhook} from '../lib/reviews/n8n-review-contract.mjs';
import {prepareSharedMessage,prepareSharedReply,sameOwnerPhone} from '../lib/whatsapp/n8n-shared-contract.mjs';

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
await db.exec(readFileSync(new URL('../supabase/migrations/20260910160709_natural_whatsapp_restaurant_selection.sql',import.meta.url),'utf8'));
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
 await reset(); let result=await send(payload('hola'));assert.match(result.reply,/Dime su nombre/);assert.doesNotMatch(result.reply,/código|RESERVAR local-a/);assert.equal(engineCalls.length,0);
 await send(payload('RESERVAR local-a'));assert.equal(engineCalls[0].restaurantId,a);
 result=await send(payload('RESERVAR desconocido'));assert.match(result.reply,/Con qué restaurante/);
 await send(payload('2'));assert.equal(engineCalls.length,1);
});
test('same number and customer switch A → B with isolated engine calls and names only on selection',async()=>{
 await reset();
 let result=await send(payload('RESERVAR local-a',{restaurantId:b,mode:'pilot'}));
 assert.equal(result.restaurantId,a);assert.match(result.reply,/^\*Local A\*/);assert.equal(engineCalls[0].mode,'live');
 result=await send(payload('reservar'));assert.equal(engineCalls.at(-1).restaurantId,a);assert.equal(result.reply,'Respuesta del motor');assert.equal(result.restaurantName,'Local A');
 result=await send(payload('RESERVAR local-b',{mode:'live'}));assert.equal(result.restaurantId,b);assert.match(result.reply,/^\*Local B\*/);
 assert.equal(engineCalls.at(-1).mode,'pilot');assert.equal(engineCalls.at(-1).text,'reservar');assert.equal(engineCalls.at(-1).startNewConversation,true);
 result=await send(payload('3'));assert.equal(engineCalls.at(-1).restaurantId,b);assert.equal(engineCalls.at(-1).from,'447700900124');assert.equal(result.reply,'Respuesta del motor');assert.equal(result.restaurantName,'Local B');
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

test('n8n forwards the sender, quoted message and safe test mode without a default restaurant',()=>{
 const input={metadata:{phone_number_id:GASTROHELP_PHONE_NUMBER_ID},contacts:[{profile:{name:'Jose'},wa_id:'447700900124'}],
  messages:[{id:'fixture',from:'447700900124',timestamp:'1788969781',text:{body:'RESERVAR local-b'},context:{id:'wamid.previous'}}],
  mode:'test',suppressDelivery:true,restaurantId:a};
 const prepared=prepareSharedMessage(input,GASTROHELP_PHONE_NUMBER_ID);
 assert.equal(prepared.validMessage,true);assert.equal(prepared.replyToMessageId,'wamid.previous');assert.equal(prepared.restaurantId,undefined);
 assert.equal(prepared.mode,'test');assert.equal(prepareSharedReply({route:'error'},prepared).deliver,false);
 assert.equal(prepareSharedMessage({...input,metadata:{phone_number_id:'wrong'}},GASTROHELP_PHONE_NUMBER_ID).validMessage,false);
 assert.equal(prepareSharedMessage({...input,suppressDelivery:false},GASTROHELP_PHONE_NUMBER_ID).mode,'router');
});

test('owner review access requires the full normalized phone, never just matching final digits',()=>{
 assert.equal(sameOwnerPhone('34600000001','600 000 001'),true);
 assert.equal(sameOwnerPhone('+34600000001','0034600000001'),true);
 assert.equal(sameOwnerPhone('44600000001','34600000001'),false);
 assert.equal(sameOwnerPhone('1234600000001','34600000001'),false);
 assert.equal(sameOwnerPhone('447700900124','7700900124'),false);
 assert.equal(sameOwnerPhone('',''),false);
});


test('normal reservation messages ask for a restaurant then continue without codes',async()=>{
 await reset();let result=await send(payload('Hola, quiero hacer una reserva'));
 assert.match(result.reply,/Con qué restaurante/);assert.doesNotMatch(result.reply,/código|RESERVAR local/);assert.equal(engineCalls.length,0);
 result=await send(payload('En Local B, por favor'));
 assert.equal(result.restaurantId,b);assert.equal(engineCalls.at(-1).text,'reservar');assert.equal(engineCalls.at(-1).startNewConversation,true);
 await send(payload('4'));assert.equal(engineCalls.at(-1).restaurantId,b);assert.equal(engineCalls.at(-1).text,'4');assert.equal(engineCalls.at(-1).startNewConversation,false);
});
test('a restaurant in a natural sentence works and ambiguous or unknown places cannot use the old selection',async()=>{
 await reset();let result=await send(payload('Buenas, me gustaría reservar en Local A para cenar'));
 assert.equal(result.restaurantId,a);assert.equal(engineCalls.at(-1).text,'reservar para cenar');
 result=await send(payload('Quiero reservar en Local A o Local B'));
 assert.match(result.reply,/varios restaurantes/);assert.equal(engineCalls.length,1);
 await send(payload('Local B'));assert.equal(engineCalls.at(-1).restaurantId,b);
 result=await send(payload('Quiero reservar en Desconocido'));assert.equal(result.restaurantId,undefined);
 await send(payload('4'));assert.equal(engineCalls.length,2);
});
test('returning customers explicitly confirm their last restaurant in a fresh conversation',async()=>{
 await reset();await send(payload('Local A'));await db.exec("update whatsapp_inbox_contacts set expires_at=now()-interval '1 minute'");
 let result=await send(payload('Hola, quiero reservar'));
 assert.match(result.reply,/Local A, como la última vez/);assert.equal(engineCalls.length,1);
 result=await send(payload('sí'));assert.equal(result.restaurantId,a);
 assert.equal(engineCalls.at(-1).text,'reservar');assert.equal(engineCalls.at(-1).startNewConversation,true);
 await db.exec("update whatsapp_inbox_contacts set expires_at=now()-interval '1 minute'");
 result=await send(payload('sí'));assert.equal(result.restaurantId,undefined);assert.equal(engineCalls.length,2);
 result=await send(payload('No'));assert.match(result.reply,/Con qué restaurante/);
 result=await send(payload('hola'));assert.doesNotMatch(result.reply,/última vez/);assert.equal(engineCalls.length,2);
 await send(payload('Local B'));assert.equal(engineCalls.at(-1).restaurantId,b);
});
test('a new local calendar day needs confirmation even before the inactivity timeout',async()=>{
 await reset();await send(payload('Local A'));
 await db.exec("update whatsapp_inbox_contacts set last_message_at=now()-interval '1 day',expires_at=now()+interval '30 minutes'");
 const result=await send(payload('quiero una mesa'));assert.equal(result.restaurantId,undefined);assert.match(result.reply,/última vez/);assert.equal(engineCalls.length,1);
});
test('pending intent contains no personal text and survives the name question',async()=>{
 await reset();await send(payload('Hola, quiero cancelar mi reserva. Soy Ana y mi correo es ana@example.invalid'));
 await send(payload('Local B'));assert.equal(engineCalls.at(-1).text,'cancelar reserva');assert.equal(engineCalls.at(-1).startNewConversation,true);
 const {rows}=await db.query('select pending_intent from whatsapp_inbox_contacts');assert.equal(rows[0].pending_intent,null);
});
test('an unavailable remembered restaurant is never suggested or silently selected',async()=>{
 await reset();await send(payload('Local A'));await db.exec("update whatsapp_inbox_contacts set expires_at=now()-interval '1 minute'");
 await db.exec(`update restaurante_modulos set chatbot=false where restaurante_id='${a}'`);
 const result=await send(payload('hola'));assert.doesNotMatch(result.reply,/Local A/);assert.equal(engineCalls.length,1);
 await db.exec(`update restaurante_modulos set chatbot=true where restaurante_id='${a}'`);
});
test('new selection state is service-only and the completion wrapper validates routes and intent',async()=>{
 for(const role of ['anon','authenticated']){
  const {rows}=await db.query("select has_function_privilege($1,'public.complete_whatsapp_inbox_selection(text,text,text,uuid,boolean,uuid,uuid,text)','EXECUTE') allowed",[role]);assert.equal(rows[0].allowed,false);
 }
 await reset();const message=payload('hola');const lock=crypto.randomUUID();
 const args={p_phone_number_id:message.phoneNumberId,p_contact_phone:'+'+message.from,p_message_id:message.messageId,p_lock_token:lock,p_test:false};
 await rpc('begin_whatsapp_inbox_turn',{...args,p_message_at:new Date(message.timestamp*1000).toISOString()});
 assert.equal((await rpc('complete_whatsapp_inbox_selection',{...args,p_restaurante_id:null,p_suggested_restaurante_id:'72000000-0000-4000-8000-000000000099',p_pending_intent:null})).data,false);
 assert.equal((await rpc('complete_whatsapp_inbox_selection',{...args,p_restaurante_id:null,p_suggested_restaurante_id:null,p_pending_intent:'private customer text'})).data,false);
 await rpc('fail_whatsapp_inbox_turn',args);
});
test('La Reserva short name is recognized without confusing ordinary booking wording',()=>{
 const restaurants=[{id:a,name:'La Reserva · Demo GastroHelp',code:'la-reserva-demo',mode:'pilot'},{id:b,name:'DEMOOOO',code:'restaurante-demo',mode:'pilot'}];
 assert.equal(routing.selectChatbotRestaurant('Hola quiero reservar en La Reserva',restaurants,null).restaurant?.id,a);
 assert.equal(routing.selectChatbotRestaurant('La Reserva',restaurants,null).restaurant?.id,a);
 assert.equal(routing.selectChatbotRestaurant('Quiero cancelar la reserva',restaurants,null).restaurant,null);
 assert.equal(routing.selectChatbotRestaurant('quiero cambiar la reserva',restaurants,b).restaurant?.id,b);
 assert.equal(routing.selectChatbotRestaurant('DEMOOOOO',restaurants,null).restaurant?.id,b);
});

test('the real booking handler starts fresh after restaurant confirmation and keeps ordinary turns intact',async()=>{
 const calls=[];
 let savedState='booking_confirm';
 const fakeDb={from(table){const query={select(){return query;},eq(){return query;},async maybeSingle(){return {error:null,data:({
  restaurantes:{id:a,nombre:'Local A'},restaurante_modulos:{chatbot:true,menu_digital:false,estado:'activo'},
  reservas_config:{activo:true,zona_horaria:'Europe/Madrid',personas_minimas:1,personas_maximas:12},
  restaurante_webs:{publicada:false,nombre_publico:'Web de prueba'},
 })[table]};}};return query;},async rpc(name,args){calls.push({name,args});
  if(name==='begin_chatbot_turn')return {data:{status:'acquired',state:savedState,draft:{party:9,name:'Old customer',start:'2099-01-01T12:00:00Z',idempotencyKey:'old'}},error:null};
  if(['complete_chatbot_turn','purge_expired_chatbot_sessions'].includes(name))return {data:true,error:null};
  throw new Error('Unexpected booking operation: '+name);
 }};
 const engine=compile('../app/lib/chatbotEngine.ts',{'./bookingDate':compile('../app/lib/bookingDate.ts')});
 const handler=compile('../app/api/chatbot/messages/route.ts',{
  '../../../lib/supabaseAdmin':{getSupabaseAdmin:()=>fakeDb},'../../../lib/chatbotEngine':engine,
  '../../../lib/publicLegal':{BOOKING_LEGAL_VERSION:'fixture'},
 }).POST;
 const invoke=async(text,startNewConversation,sharedInbox=true)=>handler(new NextRequest('https://panel.invalid/api/chatbot/messages',{
  method:'POST',headers:{'Content-Type':'application/json','X-GastroHelp-Webhook-Secret':'isolated-local-fixture'},
  body:JSON.stringify({...payload(text),restaurantId:a,mode:'pilot',startNewConversation,sharedInbox}),
 }));
 const result=await (await invoke('reservar',true)).json();assert.match(result.reply,/cuántas personas/);assert.doesNotMatch(result.reply,/Local A|Web de prueba/);
 let saved=calls.filter(c=>c.name==='complete_chatbot_turn').at(-1).args;
 assert.equal(saved.p_state,'booking_party');assert.equal(saved.p_draft.name,undefined);assert.equal(saved.p_draft.party,undefined);
 const greeting=await (await invoke('hola',true)).json();assert.match(greeting.reply,/Local A/);assert.doesNotMatch(greeting.reply,/Web de prueba/);
 const direct=await (await invoke('hola',true,false)).json();assert.match(direct.reply,/Web de prueba/);
 savedState='booking_party';await invoke('4',false);
 saved=calls.filter(c=>c.name==='complete_chatbot_turn').at(-1).args;assert.equal(saved.p_state,'booking_date');assert.equal(saved.p_draft.party,4);
});

test('greeting and selecting a restaurant do not request a booking',async()=>{
 await reset();let result=await send(payload('hola buenas'));
 assert.match(result.reply,/Con qué restaurante/);assert.match(result.reply,/en qué puedo ayudarte/i);
 assert.doesNotMatch(result.reply,/quieres reservar|cuántas personas/);assert.equal(engineCalls.length,0);
 result=await send(payload('Local B'));
 assert.equal(result.restaurantId,b);assert.equal(engineCalls.at(-1).text,'hola');
 await send(payload('quiero ver la carta'));assert.equal(engineCalls.at(-1).text,'quiero ver la carta');
 await send(payload('Quiero reservar'));assert.equal(engineCalls.at(-1).text,'Quiero reservar');
});
test('returning without a booking request only opens the restaurant assistant',async()=>{
 await reset();await send(payload('Local A'));
 await db.exec("update whatsapp_inbox_contacts set expires_at=now()-interval '1 minute'");
 await send(payload('hola buenas'));await send(payload('sí'));
 assert.equal(engineCalls.at(-1).text,'hola');assert.equal(engineCalls.at(-1).startNewConversation,true);
 await reset();await send(payload('quiero reservar'));await send(payload('hola buenas'));await send(payload('Local B'));
 assert.equal(engineCalls.at(-1).text,'hola');
});
test('demo name variations match whole names and ambiguous normalized names demand selection',()=>{
 const restaurants=[{id:a,name:'La Reserva · Demo GastroHelp',code:'la-reserva-demo',mode:'pilot'},{id:b,name:'DEMOOOO',code:'restaurante-demo',mode:'pilot'}];
 for(const text of ['demo','Demo','demoo','demooo','DEMOoooo','el demo','restaurante demo','hola, demo']){
  const result=routing.selectChatbotRestaurant(text,restaurants,null);
  assert.equal(result.restaurant?.id,b,text);assert.equal(result.engineText,'hola',text);
 }
 assert.equal(routing.selectChatbotRestaurant('quiero ver la carta del demo',restaurants,null).engineText,'carta');
 assert.equal(routing.selectChatbotRestaurant('quiero reservar en demo',restaurants,null).engineText,'reservar');
 assert.equal(routing.selectChatbotRestaurant('no quiero reservar en demo',restaurants,null).restaurant,null);
 assert.equal(routing.selectChatbotRestaurant('puedo comer sin gluten en demo',restaurants,null).engineText,'hola');
 assert.equal(routing.selectChatbotRestaurant('La Reserva · Demo GastroHelp',restaurants,null).restaurant?.id,a);
 assert.equal(routing.selectChatbotRestaurant('demo',restaurants.slice(0,1),null).restaurant,null);
 const duplicates=[...restaurants,{id:'72000000-0000-4000-8000-000000000003',name:'DEMO',code:'otro-demo',mode:'live'}];
 const ambiguous=routing.selectChatbotRestaurant('demo',duplicates,b);
 assert.equal(ambiguous.restaurant,null);assert.match(ambiguous.reply,/varios restaurantes/);
});
test('the real assistant greets, answers a menu request and starts booking only on request',async()=>{
 const engine=compile('../app/lib/chatbotEngine.ts',{'./bookingDate':compile('../app/lib/bookingDate.ts')});
 const restaurant={id:a,name:'Local A',timezone:'Europe/Madrid',bookingEnabled:true,minParty:1,maxParty:12,maxAdvanceDays:60,
  requiresEmail:false,address:'Calle de prueba',mapsUrl:'',menuUrl:'https://panel.invalid/carta/fixture',hoursLunch:'13:00–16:00',hoursDinner:'20:00–23:00'};
 const input={state:'idle',draft:{},text:'hola buenas',phone:'+447700900124',contactName:'Prueba',mode:'pilot',restaurant,
  dependencies:new Proxy({}, {get(_target,key){return ()=>{throw new Error('Unexpected operation '+String(key));};}})};
 let result=await engine.runChatbotTurn(input);assert.equal(result.state,'idle');assert.match(result.reply,/En qué puedo ayudarte/);assert.doesNotMatch(result.reply,/cuántas personas/);
 result=await engine.runChatbotTurn({...input,text:'Quiero ver la carta'});assert.equal(result.state,'idle');assert.match(result.reply,/https:\/\/panel.invalid\/carta\/fixture/);
 result=await engine.runChatbotTurn({...input,text:'no quiero reservar'});assert.equal(result.state,'idle');
 result=await engine.runChatbotTurn({...input,text:'Quiero reservar'});assert.equal(result.state,'booking_party');assert.match(result.reply,/cuántas personas/);
 result=await engine.runChatbotTurn({...input,state:result.state,draft:result.draft,text:'4'});assert.equal(result.state,'booking_date');assert.equal(result.draft.party,4);
 result=await engine.runChatbotTurn({...input,state:'booking_party',draft:{idempotencyKey:'stale'},text:'hola buenas'});assert.equal(result.state,'idle');assert.deepEqual(result.draft,{});
 result=await engine.runChatbotTurn({...input,state:'handoff',text:'hola buenas'});assert.equal(result.suppressDelivery,true);
});


const bookingDates=compile('../app/lib/bookingDate.ts');
const bookingEngine=compile('../app/lib/chatbotEngine.ts',{'./bookingDate':bookingDates});
const bookingDay=bookingDates.addCalendarDays(bookingDates.dateInTimezone('Europe/Madrid'),2);
const bookingRestaurant={id:a,name:'Local A',timezone:'Europe/Madrid',bookingEnabled:true,minParty:1,maxParty:12,maxAdvanceDays:60,
 requiresEmail:false,address:'',mapsUrl:'',menuUrl:'https://panel.invalid/carta/fixture',hoursLunch:'',hoursDinner:'',
 privacyUrl:'https://panel.invalid/privacidad',bookingTermsUrl:'https://panel.invalid/condiciones'};
const makeSlot=(time,service)=>({time,start:`${bookingDay}T${time}:00+02:00`,service});
const daySlots=[...['12:30','13:00','13:30','14:00','14:30','15:00','15:30'].map(t=>makeSlot(t,'comida')),
 ...['19:00','19:30','20:00','20:30','21:00','21:30','22:00','22:30'].map(t=>makeSlot(t,'cena'))];
function bookingConversation(initialSlots=daySlots,extra={}) {
 let state='idle',draft={},slots=initialSlots;
 const calls={availability:[],created:[],rescheduled:[]};
 const dependencies={
  async getAvailability(...args){calls.availability.push(args);return slots.map(s=>({...s}));},
  async createBooking(input){calls.created.push(input);return {reservationId:'fixture-reservation',start:input.start,managementPath:'https://panel.invalid/reserva/fixture'};},
  async listUpcomingReservations(){return [];},
  async cancelReservation(){throw new Error('Unexpected cancellation');},
  async rescheduleReservation(...args){calls.rescheduled.push(args);},
  ...extra,
 };
 return {calls,setSlots(value){slots=value;},setState(value,saved){state=value;draft=saved;},
  async send(text,mode='pilot'){
   const result=await bookingEngine.runChatbotTurn({state,draft,text,mode,phone:'+447700900124',contactName:'Prueba',restaurant:bookingRestaurant,dependencies});
   state=result.state;draft=result.draft;return result;
  }};
}
async function askBookingTime(c,text='Quiero reservar') {
 await c.send(text);await c.send('5');return c.send(bookingDay);
}

test('booking asks for the time before availability and accepts a late slot beyond the old twelve-slot cutoff',async()=>{
 const c=bookingConversation();const question=await askBookingTime(c);
 assert.equal(question.state,'booking_time');assert.match(question.reply,/A qué hora/);assert.doesNotMatch(question.reply,/12:30|19:00|disponibles/);assert.equal(c.calls.availability.length,0);
 let r=await c.send('a las 22:30');assert.equal(r.state,'booking_name');assert.equal(r.draft.time,'22:30');assert.equal(c.calls.availability.length,1);
 assert.deepEqual(c.calls.availability[0],[bookingDay,5,undefined]);assert.doesNotMatch(r.reply,/Local A/);
 r=await c.send('Cliente de prueba');assert.equal(r.state,'booking_confirm');assert.equal(c.calls.created.length,0);
 r=await c.send('ACEPTO RESERVA','live');assert.equal(r.action,'booking_created');assert.equal(c.calls.created.length,1);
 assert.equal(c.calls.created[0].start,makeSlot('22:30','cena').start);assert.equal(c.calls.created[0].party,5);
});

test('full dinner time offers only nearby dinner slots, then rechecks a different requested time',async()=>{
 const c=bookingConversation(daySlots.filter(s=>s.time!=='21:00'));await askBookingTime(c);
 let r=await c.send('21:00');assert.equal(r.state,'booking_time');assert.match(r.reply,/21:00 no hay disponibilidad/);
 assert.equal(r.draft.slots.length,4);assert.ok(r.draft.slots.every(s=>s.service==='cena'));assert.doesNotMatch(r.reply,/12:30|13:00|14:00|15:30/);
 r=await c.send('22:30');assert.equal(r.state,'booking_name');assert.equal(r.draft.time,'22:30');assert.equal(c.calls.availability.length,2);
});

test('full lunch time cannot offer dinner and a full dinner service asks for another date',async()=>{
 let c=bookingConversation(daySlots.filter(s=>s.time!=='14:00'));await askBookingTime(c);
 let r=await c.send('14');assert.equal(r.state,'booking_time');assert.ok(r.draft.slots.every(s=>s.service==='comida'));assert.doesNotMatch(r.reply,/19:00|20:00|21:00|22:00/);
 c=bookingConversation(daySlots.filter(s=>s.service==='comida'));await askBookingTime(c,'Quiero una reserva para cenar');
 r=await c.send('21:00');assert.equal(r.state,'booking_date');assert.match(r.reply,/cenar ese día/);assert.doesNotMatch(r.reply,/12:30|13:00|14:00|15:30/);assert.equal(r.draft.start,undefined);
});

test('dinner context understands nine at night and explicit morning remains morning',async()=>{
 const c=bookingConversation();await askBookingTime(c,'Quiero reservar para cenar');
 let r=await c.send('a las nueve y media');assert.equal(r.state,'booking_name');assert.equal(r.draft.time,'21:30');
 const d=bookingConversation([makeSlot('09:00','desayuno'),...daySlots]);await askBookingTime(d,'Quiero reservar para cenar');
 r=await d.send('09:00');assert.equal(r.state,'booking_name');assert.equal(r.draft.time,'09:00');
 assert.equal(routing.selectChatbotRestaurant('Quiero reservar en Local A para cenar',[{id:a,name:'Local A',code:'local-a',mode:'live'}],null).engineText,'reservar para cenar');
});

test('an ambiguous hour is clarified before availability, even when only the evening slot is free',async()=>{
 const c=bookingConversation();await askBookingTime(c);
 let r=await c.send('9');assert.equal(r.state,'booking_time');assert.match(r.reply,/09:00 o a las 21:00/);assert.equal(c.calls.availability.length,0);
 r=await c.send('de la noche');assert.equal(r.state,'booking_name');assert.equal(r.draft.time,'21:00');assert.equal(c.calls.availability.length,1);
});

test('invalid hours never query availability or select a numbered slot by accident',async()=>{
 const c=bookingConversation();await askBookingTime(c);
 for(const text of ['25:00','21:70','11/09/2026','cuando puedas']){
  const r=await c.send(text);assert.equal(r.state,'booking_time');assert.equal(r.draft.start,undefined);
 }
 assert.equal(c.calls.availability.length,0);
});

test('restaurant service labels decide alternatives even when dinner starts before 18:00',async()=>{
 const c=bookingConversation([makeSlot('13:00','comida'),makeSlot('17:30','cena'),makeSlot('18:30','cena')]);
 await askBookingTime(c);const r=await c.send('a las 18:00');
 assert.equal(r.state,'booking_time');assert.deepEqual(r.draft.slots.map(s=>s.time),['17:30','18:30']);assert.doesNotMatch(r.reply,/13:00/);
});

test('a suggested slot that fills up cannot be accepted from stale session data',async()=>{
 const c=bookingConversation(daySlots.filter(s=>s.time!=='21:00'));await askBookingTime(c);await c.send('21:00');
 c.setSlots(daySlots.filter(s=>!['21:00','21:30'].includes(s.time)));
 const r=await c.send('21:30');assert.equal(r.state,'booking_time');assert.equal(r.draft.start,undefined);assert.ok(r.draft.slots.every(s=>s.time!=='21:30'));
 assert.equal(c.calls.availability.length,2);assert.equal(c.calls.created.length,0);
});

test('a final booking conflict offers dinner alternatives and preserves the customer details',async()=>{
 let attempts=0;
 const c=bookingConversation(daySlots,{async createBooking(input){if(++attempts===1)throw new Error('SLOT_NOT_AVAILABLE');return {reservationId:'fixture',start:input.start,managementPath:'https://panel.invalid/reserva/fixture'};}});
 await askBookingTime(c);await c.send('21:00');const summary=await c.send('Cliente de prueba');
 c.setSlots(daySlots.filter(s=>s.time!=='21:00'));
 let r=await c.send('ACEPTO RESERVA','live');assert.equal(r.state,'booking_time');assert.equal(r.draft.name,'Cliente de prueba');assert.notEqual(r.draft.idempotencyKey,summary.draft.idempotencyKey);
 assert.ok(r.draft.slots.every(s=>s.service==='cena'));assert.equal(r.draft.start,undefined);
 r=await c.send('21:30');assert.equal(r.state,'booking_confirm');assert.equal(r.draft.name,'Cliente de prueba');
 r=await c.send('ACEPTO RESERVA','live');assert.equal(r.action,'booking_created');assert.equal(attempts,2);
});

test('rescheduling asks for a time and checks it while excluding only the selected reservation',async()=>{
 const c=bookingConversation();c.setState('reschedule_date',{selectedReservation:{id:'owned-reservation',managementToken:'fixture-token',party:3,start:makeSlot('20:00','cena').start}});
 let r=await c.send(bookingDay);assert.equal(r.state,'reschedule_time');assert.match(r.reply,/A qué hora/);assert.equal(c.calls.availability.length,0);
 r=await c.send('22:30');assert.equal(r.state,'reschedule_confirm');assert.deepEqual(c.calls.availability[0],[bookingDay,3,'owned-reservation']);
 r=await c.send('CONFIRMAR CAMBIO','live');assert.equal(r.action,'booking_rescheduled');assert.deepEqual(c.calls.rescheduled,[['fixture-token',makeSlot('22:30','cena').start]]);
});


test('a time given together with the date is checked without asking for it again',async()=>{
 const c=bookingConversation();await c.send('Quiero reservar');await c.send('5');
 const r=await c.send(`${bookingDay} a las 22:00`);assert.equal(r.state,'booking_name');assert.equal(r.draft.time,'22:00');assert.equal(c.calls.availability.length,1);
});
