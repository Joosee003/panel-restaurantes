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
await db.exec(readFileSync(new URL('../supabase/migrations/20260910233856_retain_whatsapp_booking_details.sql',import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20260911124918_private_live_chatbot_routes.sql',import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20260912130239_conversational_availability_intent.sql',import.meta.url),'utf8'));
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
const bookingDetails=compile('../lib/chatbot/booking-details.ts');
const routing=compile('../lib/chatbot/shared-routing.ts',{'./booking-details':bookingDetails});
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
test('same number and customer switch A → B with isolated engine calls and no repeated name headers',async()=>{
 await reset();
 let result=await send(payload('RESERVAR local-a',{restaurantId:b,mode:'pilot'}));
 assert.equal(result.restaurantId,a);assert.equal(result.reply,'Respuesta del motor');assert.equal(engineCalls[0].mode,'live');
 result=await send(payload('reservar'));assert.equal(engineCalls.at(-1).restaurantId,a);assert.equal(result.reply,'Respuesta del motor');assert.equal(result.restaurantName,'Local A');
 result=await send(payload('RESERVAR local-b',{mode:'live'}));assert.equal(result.restaurantId,b);assert.equal(result.reply,'Respuesta del motor');
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
 const engine=compile('../app/lib/chatbotEngine.ts',{'../../lib/chatbot/booking-details':bookingDetails,'./bookingDate':compile('../app/lib/bookingDate.ts')});
 const handler=compile('../app/api/chatbot/messages/route.ts',{
  '../../../lib/supabaseAdmin':{getSupabaseAdmin:()=>fakeDb},'../../../lib/chatbotEngine':engine,
  '../../../lib/publicLegal':{BOOKING_LEGAL_VERSION:'fixture'},'../../../lib/chatbotHours':compile('../app/lib/chatbotHours.ts'),
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
 const engine=compile('../app/lib/chatbotEngine.ts',{'../../lib/chatbot/booking-details':bookingDetails,'./bookingDate':compile('../app/lib/bookingDate.ts')});
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
const bookingEngine=compile('../app/lib/chatbotEngine.ts',{'../../lib/chatbot/booking-details':bookingDetails,'./bookingDate':bookingDates});
const bookingDay=bookingDates.addCalendarDays(bookingDates.dateInTimezone('Europe/Madrid'),2);
const bookingRestaurant={id:a,name:'Local A',timezone:'Europe/Madrid',bookingEnabled:true,minParty:1,maxParty:12,maxAdvanceDays:60,
 requiresEmail:false,address:'',mapsUrl:'',menuUrl:'https://panel.invalid/carta/fixture',hoursLunch:'',hoursDinner:'',
 privacyUrl:'https://panel.invalid/privacidad',bookingTermsUrl:'https://panel.invalid/condiciones'};
const makeSlot=(time,service)=>({time,start:`${bookingDay}T${time}:00+02:00`,service});
const daySlots=[...['12:30','13:00','13:30','14:00','14:30','15:00','15:30'].map(t=>makeSlot(t,'comida')),
 ...['19:00','19:30','20:00','20:30','21:00','21:30','22:00','22:30'].map(t=>makeSlot(t,'cena'))];
function bookingConversation(initialSlots=daySlots,extra={},restaurant=bookingRestaurant) {
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
   const result=await bookingEngine.runChatbotTurn({state,draft,text,mode,phone:'+447700900124',contactName:'Prueba',restaurant,dependencies});
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

test('available lunch alternatives stay at lunch and a full dinner keeps the selected date',async()=>{
 let c=bookingConversation(daySlots.filter(s=>s.time!=='14:00'));await askBookingTime(c);
 let r=await c.send('14');assert.equal(r.state,'booking_time');assert.ok(r.draft.slots.every(s=>s.service==='comida'));assert.doesNotMatch(r.reply,/19:00|20:00|21:00|22:00/);
 c=bookingConversation(daySlots.filter(s=>s.service==='comida'));await askBookingTime(c,'Quiero una reserva para cenar');
 r=await c.send('21:00');assert.equal(r.state,'booking_time');assert.equal(r.draft.date,bookingDay);assert.match(r.reply,/cenar ese día/);assert.doesNotMatch(r.reply,/12:30|13:00|14:00|15:30/);assert.equal(r.draft.start,undefined);
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
 for(const text of ['25:00','21:70','cuando puedas']){
  const r=await c.send(text);assert.equal(r.state,'booking_time');assert.equal(r.draft.start,undefined);
 }
 const invalidDate=await c.send('11/09/2026');assert.equal(invalidDate.state,'booking_date');
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
 const c=bookingConversation(daySlots,{async createBooking(input){if(++attempts===1){c.setSlots(daySlots.filter(s=>s.time!=='21:00'));throw new Error('SLOT_NOT_AVAILABLE');}return {reservationId:'fixture',start:input.start,managementPath:'https://panel.invalid/reserva/fixture'};}});
 await askBookingTime(c);await c.send('21:00');const summary=await c.send('Cliente de prueba');
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


test('hours in plural and opening questions query the schedule and survive restaurant selection',async()=>{
 const queried=[];const c=bookingConversation([],{async getOpeningHours(date){queried.push(date);return 'Horario habitual: 12:30–17:00 y 19:00–23:30';}});
 for(const text of ['horarios','horario','¿A qué hora abrís?','¿Cuándo cerráis?','¿Está abierto?','horarios para reservar']) {
  const r=await c.send(text);assert.equal(r.state,'idle');assert.match(r.reply,/12:30–17:00/);assert.doesNotMatch(r.reply,/soy el asistente|cuántas personas/);
 }
 await c.send('horarios mañana');assert.equal(queried.at(-1),bookingDates.addCalendarDays(bookingDates.dateInTimezone('Europe/Madrid'),1));
 await reset();await send(payload('horarios'));await send(payload('Local B'));assert.equal(engineCalls.at(-1).text,'horario');
 await send(payload('horarios'));assert.equal(engineCalls.at(-1).text,'horarios');
});

const {readChatbotHours}=compile('../app/lib/chatbotHours.ts');
function hoursDb(schedules,exceptions=[],fail=false){
 const calls=[];
 return {calls,from(table){const filters={};const q={select(){return q;},eq(key,value){filters[key]=value;return q;},in(key,values){filters[key]=values;return q;},
  then(resolve,reject){calls.push({table,filters:{...filters}});const rows=table==='reservas_horarios'?schedules:exceptions;
   return Promise.resolve({data:rows.filter(row=>Object.entries(filters).every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value)),error:fail?{message:'unavailable'}:null}).then(resolve,reject);}};return q;}};
}
const scheduleRow=(restaurant,day,start,end,service='comida',active=true)=>({restaurante_id:restaurant,dia_semana:day,hora_inicio:start,hora_fin:end,turno:service,activo:active});

test('weekly hours read only the selected restaurant, include closed days and ignore inactive rows',async()=>{
 const rows=[...Array.from({length:7},(_,d)=>scheduleRow(a,d,'12:30:00','17:00:00')),
  ...Array.from({length:7},(_,d)=>scheduleRow(b,d,'20:00:00','23:30:00','cena'))];
 const db=hoursDb(rows);assert.match(await readChatbotHours(db,a),/todos los días:\nComidas: 12:30–17:00/);
 assert.doesNotMatch(await readChatbotHours(db,a),/20:00|23:30/);assert.match(await readChatbotHours(db,b),/Cenas: 20:00–23:30/);
 assert.ok(db.calls.every(call=>[a,b].includes(call.filters.restaurante_id)));
 const days=hoursDb([scheduleRow(a,1,'12:30','17:00','comida',false),scheduleRow(a,2,'12:30','17:00')]);
 const reply=await readChatbotHours(days,a);assert.match(reply,/Lunes:\nCerrado/);assert.match(reply,/Martes:\nComidas: 12:30–17:00/);
});

test('date-specific hours apply special schedules and full or partial closures without leaking another restaurant',async()=>{
 const day=new Date(`${bookingDay}T12:00:00Z`).getUTCDay();
 const rows=[scheduleRow(a,day,'12:30','17:00'),scheduleRow(b,day,'08:00','09:00')];
 const special={restaurante_id:a,fecha:bookingDay,tipo:'horario_especial',turno:'cena',hora_inicio:'18:00',hora_fin:'23:00'};
 let db=hoursDb(rows,[special,{restaurante_id:a,fecha:bookingDay,tipo:'cierre',hora_inicio:'20:00',hora_fin:'21:00'},
  {restaurante_id:b,fecha:bookingDay,tipo:'cierre',hora_inicio:null,hora_fin:null}]);
 let reply=await readChatbotHours(db,a,bookingDay);assert.match(reply,/18:00–20:00/);assert.match(reply,/21:00–23:00/);assert.doesNotMatch(reply,/12:30|08:00|Cerrado/);
 assert.ok(db.calls.every(call=>call.filters.restaurante_id===a));assert.equal(db.calls[1].filters.fecha,bookingDay);
 db=hoursDb(rows,[special,{restaurante_id:a,fecha:bookingDay,tipo:'cierre',hora_inicio:null,hora_fin:null}]);
 reply=await readChatbotHours(db,a,bookingDay);assert.match(reply,/Cerrado/);assert.doesNotMatch(reply,/18:00/);
});

test('schedule failures do not silently reply with old hours and all-disabled schedules remain closed',async()=>{
 await assert.rejects(()=>readChatbotHours(hoursDb([],[],true),a),/CHATBOT_HOURS_UNAVAILABLE/);
 const c=bookingConversation([],{async getOpeningHours(){throw new Error('unavailable');}});
 const r=await c.send('horarios');assert.match(r.reply,/No puedo consultar el horario ahora/);assert.doesNotMatch(r.reply,/soy el asistente/);
 assert.match(await readChatbotHours(hoursDb([scheduleRow(a,1,'12:30','17:00','comida',false)]),a),/Cerrado/);
 assert.equal(await readChatbotHours(hoursDb([]),a),null);
});

test('opening booking time survives party and date answers, including spaced minutes',async()=>{
 const c=bookingConversation();let r=await c.send('reservar a las 19 30');
 assert.equal(r.state,'booking_party');assert.equal(r.draft.time,'19:30');
 r=await c.send('8 personas');assert.equal(r.state,'booking_date');assert.equal(r.draft.time,'19:30');
 r=await c.send(bookingDay);assert.equal(r.state,'booking_name');assert.equal(r.draft.time,'19:30');assert.doesNotMatch(r.reply,/qué hora/);
 assert.deepEqual(c.calls.availability,[[bookingDay,8,undefined]]);
});

test('known booking details are collected once and a later explicit hour replaces the first',async()=>{
 const c=bookingConversation();let r=await c.send(`Quiero reservar para 4 personas el ${bookingDay} a las 19 30`);
 assert.equal(r.state,'booking_name');assert.equal(r.draft.party,4);assert.equal(r.draft.time,'19:30');
 r=await c.send('mejor a las 20 30');assert.equal(r.state,'booking_name');assert.equal(r.draft.time,'20:30');assert.equal(r.draft.name,undefined);
 r=await c.send('Cliente Prueba');assert.equal(r.state,'booking_confirm');assert.equal(r.draft.time,'20:30');
 assert.doesNotMatch(r.reply,/ACEPTO|exactamente|Condiciones|Privacidad|https:/);
 assert.match(r.reply,/Son correctos estos datos/);
 r=await c.send('Sí, está bien.','live');assert.equal(r.action,'booking_created');assert.equal(c.calls.created.length,1);
 assert.equal(c.calls.created[0].confirmation.response,'Sí, está bien.');assert.match(c.calls.created[0].confirmation.prompt,/20:30/);
});

test('negative confirmation asks what is wrong, edits only that field and requires a fresh yes',async()=>{
 const c=bookingConversation();await c.send(`reservar para 8 personas el ${bookingDay} a las 19:30`);const old=await c.send('Cliente Prueba');
 let r=await c.send('no','live');assert.equal(r.state,'booking_confirm');assert.match(r.reply,/Qué dato está mal/);assert.equal(c.calls.created.length,0);
 r=await c.send('sí','live');assert.match(r.reply,/Qué dato está mal/);assert.equal(c.calls.created.length,0);
 r=await c.send('las personas');assert.equal(r.state,'booking_party');assert.equal(r.draft.name,'Cliente Prueba');assert.equal(r.draft.time,'19:30');
 r=await c.send('6');assert.equal(r.state,'booking_confirm');assert.equal(r.draft.party,6);assert.equal(r.draft.date,bookingDay);assert.equal(r.draft.name,'Cliente Prueba');assert.equal(r.draft.time,'19:30');assert.notEqual(r.draft.idempotencyKey,old.draft.idempotencyKey);
 assert.equal(c.calls.created.length,0);r=await c.send('sí, correcto','live');assert.equal(r.action,'booking_created');assert.equal(c.calls.created.length,1);assert.equal(c.calls.created[0].party,6);
});

test('inline corrections and field-only corrections preserve all other details including required email',async()=>{
 const c=bookingConversation(daySlots,{}, {...bookingRestaurant,requiresEmail:true});
 await c.send(`reservar para 4 personas el ${bookingDay} a las 19:30`);let r=await c.send('Nombre Inicial');assert.equal(r.state,'booking_email');
 r=await c.send('fixture@example.invalid');assert.equal(r.state,'booking_confirm');
 r=await c.send('no, somos 6','live');assert.equal(r.draft.party,6);assert.equal(r.state,'booking_confirm');assert.equal(r.draft.email,'fixture@example.invalid');
 r=await c.send('sí, pero la hora es 20:30','live');assert.equal(r.draft.time,'20:30');assert.equal(r.state,'booking_confirm');assert.equal(c.calls.created.length,0);
 r=await c.send('el nombre está mal');assert.equal(r.state,'booking_name');assert.equal(r.draft.name,undefined);
 r=await c.send('a nombre de Nombre Corregido');assert.equal(r.state,'booking_confirm');assert.equal(r.draft.name,'Nombre Corregido');assert.equal(r.draft.email,'fixture@example.invalid');assert.equal(r.draft.time,'20:30');
 for(const text of ['no sé','quizá','sí pero espera','no está correcto','no confirmo']) {
  r=await c.send(text,'live');assert.equal(c.calls.created.length,0);
 }
});

test('ordinary affirmatives create only after the current summary, and the actual customer app follows success',async()=>{
 for(const text of ['sí','si, todo correcto','correcto','todo bien','vale','de acuerdo','perfecto','sí por favor','adelante']) {
  const created=[];const c=bookingConversation(daySlots,{async createBooking(input){created.push(input);return {reservationId:'fixture',start:input.start,managementPath:'https://panel.invalid/reserva/fixture',clientAppPath:'https://panel.invalid/c/own-customer-token'};}});
  await c.send(`reservar para 2 personas el ${bookingDay} a las 19:30`);const summary=await c.send('Prueba');
  assert.doesNotMatch(summary.reply,/own-customer-token|privacidad|condiciones/i);
  const r=await c.send(text,'live');assert.equal(r.action,'booking_created',text);assert.equal(created.length,1);assert.match(r.reply,/Tu app del cliente: https:\/\/panel.invalid\/c\/own-customer-token/);
  assert.deepEqual(created[0].confirmation,{prompt:summary.reply,response:text,version:'booking-details-v1'});
  await c.send(text,'live');assert.equal(created.length,1);
 }
});

test('a filled slot at final confirmation is rechecked, while pilot never writes bookings',async()=>{
 const c=bookingConversation();await c.send(`reservar para 2 personas el ${bookingDay} a las 19:30`);await c.send('Prueba');
 c.setSlots(daySlots.filter(s=>s.time!=='19:30'));let r=await c.send('sí','live');assert.equal(r.state,'booking_time');assert.equal(c.calls.created.length,0);assert.equal(r.draft.name,'Prueba');
 r=await c.send('20:00');assert.equal(r.state,'booking_confirm');r=await c.send('sí');assert.equal(r.action,'test_only');assert.match(r.reply,/No se ha creado ninguna reserva real/);assert.equal(c.calls.created.length,0);
});

test('time validation keeps morning separate from tomorrow, and does not parse dates or party sizes as hours',async()=>{
 assert.equal(bookingDetails.explicitParty('para 11/09/2026 a las 19:30'),null);
 assert.equal(bookingDetails.parseRequestedTime('8 personas'),null);
 assert.equal(bookingDetails.parseRequestedTime('19 70'),null);
 const c=bookingConversation([makeSlot('09:30','desayuno'),...daySlots]);
 let r=await c.send('reservar a las 9:30 de la mañana');assert.equal(r.draft.date,undefined);assert.equal(r.draft.time,'09:30');
 await c.send('2');r=await c.send(bookingDay);assert.equal(r.state,'booking_name');assert.equal(r.draft.time,'09:30');
 const d=bookingConversation();await d.send('reservar a las 9');await d.send('2');r=await d.send(bookingDay);assert.equal(r.state,'booking_time');assert.match(r.reply,/09:00 o a las 21:00/);assert.equal(d.calls.availability.length,0);
});

test('booking articles and party answers never invent an hour',async()=>{
 for(const text of ['una reserva para hoy','una mesa para mañana','una reserva para cenar','un sitio para comer',
  'cinco personas','5 para hoy','dos mesas','una reserva a nombre de Uno']) {
  assert.equal(bookingDetails.parseRequestedTime(text),null,text);
 }
 assert.equal(bookingDetails.parseRequestedTime('cinco',undefined,false),null);
 assert.equal(bookingDetails.parseRequestedTime('una',undefined,false),null);
 assert.equal(bookingDetails.parseRequestedTime('una').ambiguous,'1:00');
 assert.equal(bookingDetails.parseRequestedTime('cinco de la tarde').time,'17:00');
 assert.equal(bookingDetails.parseRequestedTime('a las nueve y media para cenar',undefined,false).time,'21:30');
 assert.equal(bookingDetails.parseRequestedTime('19 30',undefined,false).time,'19:30');
 assert.equal(bookingDetails.parseRequestedTime('mejor a las 19 30',undefined,false).time,'19:30');
 assert.equal(bookingDetails.explicitParty('para una reserva'),null);
 assert.equal(bookingDetails.explicitParty('para 19 30'),null);
});

test('the reported today and five-person conversation asks only for the missing time in each restaurant',async()=>{
 for(const restaurant of [bookingRestaurant,{...bookingRestaurant,id:b,name:'Local B',timezone:'Atlantic/Canary'}]) {
  for(const partyAnswer of ['5','cinco','cinco personas','somos cinco','5 gracias']) {
   const today=bookingDates.dateInTimezone(restaurant.timezone);
   const slot={time:'21:00',start:`${today}T21:00:00Z`,service:'cena'};
   const c=bookingConversation([slot],{},restaurant);
   let r=await c.send('una reserva para hoy');assert.equal(r.state,'booking_party');assert.equal(r.draft.date,today);
   assert.equal(r.draft.time,undefined);assert.equal(r.draft.timeToClarify,undefined);
   r=await c.send(partyAnswer);assert.equal(r.state,'booking_time');assert.equal(r.draft.party,5);
   assert.equal(r.draft.date,today);assert.equal(r.draft.timeToClarify,undefined);
   assert.match(r.reply,/A qué hora/);assert.doesNotMatch(r.reply,/01:00|13:00|fecha|personas/);
   assert.equal(c.calls.availability.length,0);assert.equal(c.calls.created.length,0);
   r=await c.send('21 00');assert.equal(r.state,'booking_name');assert.deepEqual(c.calls.availability,[[today,5,undefined]]);
   r=await c.send('Cliente Comprobación');assert.equal(r.state,'booking_confirm');assert.equal(c.calls.created.length,0);
   r=await c.send('correcto','live');assert.equal(r.action,'booking_created');assert.equal(c.calls.created.length,1);
   assert.equal(c.calls.created[0].party,5);assert.equal(c.calls.created[0].start,slot.start);
  }
 }
});

test('written party answers preserve an earlier explicit time and date',async()=>{
 for(const reply of ['cinco','somos cinco','cinco personas']) {
  const c=bookingConversation();let r=await c.send(`una reserva el ${bookingDay} a las 19 30`);
  assert.equal(r.state,'booking_party');assert.equal(r.draft.time,'19:30');
  r=await c.send(reply);assert.equal(r.state,'booking_name');assert.equal(r.draft.party,5);
  assert.equal(r.draft.time,'19:30');assert.equal(r.draft.date,bookingDay);
  assert.equal(r.draft.timeToClarify,undefined);assert.doesNotMatch(r.reply,/qué hora/);
 }
});

test('restaurant selection retains the date and party without turning an article into an hour',async()=>{
 await reset();await send(payload('una reserva para hoy'));
 const pending=(await db.query('select pending_intent from whatsapp_inbox_contacts')).rows[0].pending_intent;
 assert.equal(pending,'reservar hoy');
 await send(payload('local-b'));assert.equal(engineCalls.at(-1).text,'reservar hoy');assert.equal(engineCalls.at(-1).restaurantId,b);
 const c=bookingConversation();let r=await c.send(engineCalls.at(-1).text);assert.equal(r.draft.timeToClarify,undefined);
 r=await c.send('5');assert.equal(r.state,'booking_time');assert.match(r.reply,/A qué hora/);
 const selected=routing.selectChatbotRestaurant('una reserva en Local A para cinco personas hoy',
  [{id:a,name:'Local A',code:'local-a',mode:'live'}],b);
 assert.equal(selected.restaurant.id,a);assert.equal(selected.reset,true);assert.equal(selected.engineText,'reservar para 5 personas hoy');
});

test('shared inbox retains canonical booking details before selection without retaining names or contact details',async()=>{
 await reset();const text=`quiero reservar para 8 personas el ${bookingDay} a las 19 30, me llamo Prueba, correo fixture@example.invalid`;
 await send(payload(text));assert.equal(engineCalls.length,0);
 const saved=(await db.query('select pending_intent from whatsapp_inbox_contacts')).rows[0].pending_intent;
 assert.equal(saved,`reservar para 8 personas el ${bookingDay} a las 19:30`);assert.doesNotMatch(saved,/Prueba|fixture|@/);
 await send(payload('local-b'));assert.equal(engineCalls.at(-1).restaurantId,b);assert.equal(engineCalls.at(-1).text,saved);
 const selected=routing.selectChatbotRestaurant(`quiero reservar en Local A el ${bookingDay} a las 19 30`,[{id:a,name:'Local A',code:'local-a',mode:'live'}],null);
 assert.equal(selected.engineText,`reservar el ${bookingDay} a las 19:30`);
 for(const invalid of ['reservar nombre Prueba','reservar telefono 447700900124','reservar a las 19:30 correo fixture@example.invalid']) {
  await assert.rejects(db.query('update whatsapp_inbox_contacts set pending_intent=$1',[invalid]),/check constraint/);
 }
});

test('date correction keeps the hour and name, then validates the new date before confirmation',async()=>{
 const c=bookingConversation();await c.send(`reservar para 4 personas el ${bookingDay} a las 19 30`);await c.send('Prueba');
 let r=await c.send('no, la fecha está mal');assert.equal(r.state,'booking_date');assert.equal(r.draft.time,'19:30');assert.equal(r.draft.name,'Prueba');
 const nextDay=bookingDates.addCalendarDays(bookingDay,1);c.setSlots(daySlots.map(s=>({...s,start:s.start.replace(bookingDay,nextDay)})));
 r=await c.send(nextDay);assert.equal(r.state,'booking_confirm');assert.equal(r.draft.date,nextDay);assert.equal(r.draft.time,'19:30');assert.equal(r.draft.name,'Prueba');assert.equal(c.calls.created.length,0);
 r=await c.send('sí','live');assert.equal(r.action,'booking_created');assert.ok(c.calls.created[0].start.startsWith(nextDay));
});

test('the actual HTTP booking handler passes truthful confirmation to SQL and returns the customer app',async()=>{
 const calls=[];let state='idle',draft={};
 const fakeDb={from(table){const filters={};const query={select(){return query;},eq(key,val){filters[key]=val;return query;},async maybeSingle(){
  assert.equal(filters[table==='restaurantes'?'id':'restaurante_id'],a);
  return {error:null,data:({restaurantes:{id:a,nombre:'Local A'},restaurante_modulos:{chatbot:true,menu_digital:false,estado:'activo'},
   reservas_config:{activo:true,zona_horaria:'Europe/Madrid',personas_minimas:1,personas_maximas:12},
   restaurante_webs:{publicada:true,nombre_publico:'Local A',titular_legal:'Fixture',nif_cif:'fixture',domicilio_legal:'Fixture',email_legal:'fixture@example.invalid'},
  })[table]};}};return query;},async rpc(name,args){calls.push({name,args});
  if(name==='begin_chatbot_turn')return {data:{status:'acquired',state,draft},error:null};
  if(name==='complete_chatbot_turn'){state=args.p_state;draft=args.p_draft;return {data:true,error:null};}
  if(name==='purge_expired_chatbot_sessions')return {data:true,error:null};
  if(name==='obtener_disponibilidad_chatbot'){assert.equal(args.p_restaurante_id,a);return {data:daySlots.map(s=>({inicio_at:s.start,hora_local:s.time,turno:s.service})),error:null};}
  if(name==='crear_reserva_chatbot_confirmada')return {data:{ok:true,reserva_id:'fixture',inicio_at:args.p_inicio_at,gestion_token:'manage-fixture',cliente_app_token:'own-app-fixture'},error:null};
  throw new Error('Unexpected operation '+name);
 }};
 const handler=compile('../app/api/chatbot/messages/route.ts',{
  '../../../lib/supabaseAdmin':{getSupabaseAdmin:()=>fakeDb},'../../../lib/chatbotEngine':bookingEngine,'../../../lib/chatbotHours':{readChatbotHours:async()=>null},
 }).POST;
 const invoke=async text=>{const message=payload(text);const response=await handler(new NextRequest('https://panel.invalid/api/chatbot/messages',{
  method:'POST',headers:{'Content-Type':'application/json','X-GastroHelp-Webhook-Secret':'isolated-local-fixture'},
  body:JSON.stringify({...message,restaurantId:a,mode:'live',sharedInbox:true}),
 }));assert.equal(response.status,200);return {message,result:await response.json()};};
 await invoke(`reservar para 4 personas el ${bookingDay} a las 19 30`);const summary=await invoke('Cliente Prueba');
 assert.doesNotMatch(summary.result.reply,/condiciones|privacidad|ACEPTO RESERVA/i);
 const accepted=await invoke('sí, correcto');assert.equal(accepted.result.action,'booking_created');assert.match(accepted.result.reply,/Tu app del cliente: .*\/c\/own-app-fixture/);
 const created=calls.filter(c=>c.name==='crear_reserva_chatbot_confirmada');assert.equal(created.length,1);assert.equal(created[0].args.p_restaurante_id,a);
 assert.deepEqual(created[0].args.p_confirmacion,{prompt:summary.result.reply,response:'sí, correcto',version:'booking-details-v1',messageId:accepted.message.messageId});
 assert.equal(created[0].args.p_acepta_privacidad,undefined);assert.equal(created[0].args.p_acepta_condiciones,undefined);
});

test('private live restaurants use real booking mode only for their configured test phones',async()=>{
 await reset();await db.query("update whatsapp_restaurant_routes set delivery_mode='private_live' where restaurante_id=$1",[b]);
 try {
  await send(payload('RESERVAR local-b',{mode:'live',from:'447700900199'}));assert.equal(engineCalls.length,0);
  let r=await send(payload('RESERVAR local-b',{mode:'test'}));assert.equal(r.preview.configuredMode,'private_live');assert.equal(engineCalls.length,0);
  r=await send(payload('RESERVAR local-b'));assert.equal(r.restaurantId,b);assert.equal(engineCalls.at(-1).mode,'live');assert.equal(r.reply,'Respuesta del motor');
  r=await send(payload('4'));assert.equal(r.restaurantId,b);assert.equal(r.reply,'Respuesta del motor');
  r=await send(payload('RESERVAR local-a'));assert.equal(r.restaurantId,a);assert.equal(r.reply,'Respuesta del motor');
 } finally {await db.query("update whatsapp_restaurant_routes set delivery_mode='pilot' where restaurante_id=$1",[b]);}
});

test('private live writes require the server phone allowlist and a marked demo or complete restaurant setup',async()=>{
 for(const scenario of [
  {name:'authorized demo',demo:true,enabled:true,allowed:true,mode:'private_live',expected:200,creates:true},
  {name:'phone outside allowlist',demo:true,enabled:true,allowed:false,mode:'private_live',expected:403},
  {name:'disabled route',demo:true,enabled:false,allowed:true,mode:'private_live',expected:403},
  {name:'unconfigured actual restaurant',demo:false,enabled:true,allowed:true,mode:'private_live',expected:200,creates:false},
  {name:'public route cannot request the demo exception',demo:true,enabled:true,allowed:true,mode:'live',expected:200,creates:false},
 ]) {
  let state='idle',draft={};const created=[];
  const fakeDb={from(table){const q={select(){return q;},eq(key,val){assert.equal(val,a);return q;},async maybeSingle(){return {error:null,data:({
   restaurantes:{id:a,nombre:'Local A'},restaurante_modulos:{chatbot:true,menu_digital:false,estado:'activo'},
   reservas_config:{activo:true,zona_horaria:'Europe/Madrid',personas_minimas:1,personas_maximas:12},
   restaurante_webs:{es_demo:scenario.demo,nombre_publico:'Local A',publicada:true},
   whatsapp_restaurant_routes:{enabled:scenario.enabled,delivery_mode:scenario.mode,pilot_phones:scenario.allowed?['+447700900124']:[]},
  })[table]};}};return q;},async rpc(name,args){
   if(name==='purge_expired_chatbot_sessions')return {data:true,error:null};
   if(name==='begin_chatbot_turn')return {data:{status:'acquired',state,draft},error:null};
   if(name==='complete_chatbot_turn'){state=args.p_state;draft=args.p_draft;return {data:true,error:null};}
   if(name==='obtener_disponibilidad_chatbot')return {data:daySlots.map(s=>({inicio_at:s.start,hora_local:s.time,turno:s.service})),error:null};
   if(name==='crear_reserva_chatbot_confirmada'){created.push(args);return {data:{ok:true,reserva_id:'fixture',inicio_at:args.p_inicio_at,gestion_token:'manage-fixture',cliente_app_token:'app-fixture'},error:null};}
   throw new Error('Unexpected '+name);
  }};
  const handler=compile('../app/api/chatbot/messages/route.ts',{
   '../../../lib/supabaseAdmin':{getSupabaseAdmin:()=>fakeDb},'../../../lib/chatbotEngine':bookingEngine,'../../../lib/chatbotHours':{readChatbotHours:async()=>null},
  }).POST;
  const invoke=async text=>handler(new NextRequest('https://panel.invalid/api/chatbot/messages',{
   method:'POST',headers:{'Content-Type':'application/json','X-GastroHelp-Webhook-Secret':'isolated-local-fixture'},
   body:JSON.stringify({...payload(text),restaurantId:a,mode:'live',sharedInbox:true,privateDemoBooking:true}),
  }));
  let r=await invoke(`reservar para 2 personas el ${bookingDay} a las 20:30`);assert.equal(r.status,scenario.expected,scenario.name);
  if(scenario.creates) {
   await invoke('Comprobación');r=await invoke('sí');const result=await r.json();assert.equal(result.action,'booking_created');assert.doesNotMatch(result.reply,/PRUEBA|sería válida/);assert.equal(created.length,1);assert.equal(created[0].p_restaurante_id,a);
  } else {assert.equal(created.length,0);if(scenario.expected===200)assert.equal((await r.json()).handoff,true);}
 }
});

const serviceRanges=[{service:'comida',start:'13:00',end:'16:00'},{service:'cena',start:'20:00',end:'23:30'}];
const dinnerSlots=['20:00','20:30','21:00','21:30','22:00'].map(t=>makeSlot(t,'cena'));

test('reported 17:00 conversation preserves today and answers both abbreviated availability questions',async()=>{
 for(const restaurant of [bookingRestaurant,{...bookingRestaurant,id:b,name:'Local B',timezone:'Atlantic/Canary'}]) {
  const c=bookingConversation(dinnerSlots,{getServiceRanges:async()=>serviceRanges},restaurant);
  await c.send('una reserva para hoy');await c.send('5');
  let r=await c.send('17:00');assert.equal(r.state,'booking_time');assert.equal(r.draft.party,5);
  assert.equal(r.draft.date,bookingDates.dateInTimezone(restaurant.timezone));assert.match(r.reply,/fuera del horario/);
  assert.match(r.reply,/Para cenar: 20:00/);assert.doesNotMatch(r.reply,/otra fecha|no es válida|13:00/);
  for(const question of ['q horas hay','que horas tienes hoy?']) {
   r=await c.send(question);assert.equal(r.state,'booking_time');assert.equal(r.draft.party,5);
   assert.equal(r.draft.date,bookingDates.dateInTimezone(restaurant.timezone));assert.equal(r.draft.time,undefined);
   assert.match(r.reply,/20:00, 20:30, 21:00, 21:30, 22:00/);assert.doesNotMatch(r.reply,/17:00|no es válida|otra fecha/);
  }
  r=await c.send('21:00');assert.equal(r.state,'booking_name');assert.equal(r.draft.time,'21:00');
  r=await c.send('Cliente');assert.equal(r.state,'booking_confirm');assert.equal(c.calls.created.length,0);
  r=await c.send('sí','live');assert.equal(r.action,'booking_created');assert.equal(c.calls.created.length,1);
 }
});

test('availability questions work at every booking step without becoming names or confirmations',async()=>{
 for(const state of ['booking_party','booking_date','booking_time','booking_name','booking_email','booking_confirm']) {
  const c=bookingConversation(dinnerSlots);c.setState(state,{party:5,date:bookingDay,name:'Nombre guardado',time:'17:00',service:'comida',confirmationVersion:'booking-details-v1',confirmationPrompt:'Old summary',start:'stale'});
  const r=await c.send('q horas tienes?','live');assert.equal(r.state,'booking_time',state);
  assert.equal(r.draft.date,bookingDay);assert.equal(r.draft.party,5);assert.equal(r.draft.name,'Nombre guardado');
  assert.equal(r.draft.start,undefined);assert.equal(r.draft.confirmationPrompt,undefined);
  assert.match(r.reply,/Para cenar/);assert.equal(c.calls.created.length,0);
 }
});

test('availability before booking asks only missing date and party and then lists actual slots',async()=>{
 const c=bookingConversation(dinnerSlots);let r=await c.send('que horas tienes mañana?');
 assert.equal(r.state,'booking_party');assert.equal(c.calls.availability.length,0);
 const date=r.draft.date;r=await c.send('cinco');assert.equal(r.state,'booking_time');assert.equal(r.draft.date,date);
 assert.match(r.reply,/20:00/);assert.deepEqual(c.calls.availability,[[date,5,undefined]]);
 const d=bookingConversation(dinnerSlots);r=await d.send('hay sitio para cinco personas?');assert.equal(r.state,'booking_date');
 r=await d.send(bookingDay);assert.equal(r.state,'booking_time');assert.equal(r.draft.party,5);assert.match(r.reply,/20:00/);
});

test('availability retains safe intent across restaurant selection and rejects personal data in SQL',async()=>{
 await reset();await send(payload('q horas hay mañana para cinco personas?'));
 const pending=(await db.query('select pending_intent from whatsapp_inbox_contacts')).rows[0].pending_intent;
 assert.equal(pending,'disponibilidad para 5 personas manana');await send(payload('local-b'));
 assert.equal(engineCalls.at(-1).restaurantId,b);assert.equal(engineCalls.at(-1).text,pending);
 const c=bookingConversation(dinnerSlots);const r=await c.send(pending);assert.equal(r.state,'booking_time');assert.match(r.reply,/20:00/);
 for(const invalid of ['disponibilidad correo a@example.invalid','disponibilidad me llamo Jose','disponibilidad para 5 personas; select 1','disponibilidad '+ 'a'.repeat(201)]) {
  assert.equal((await db.query('select public.valid_whatsapp_pending_intent($1) valid',[invalid])).rows[0].valid,false);
 }
 assert.equal((await db.query("select has_function_privilege('anon','public.valid_whatsapp_pending_intent(text)','execute') allowed")).rows[0].allowed,false);
});

test('full day keeps the date, supports another day, and never claims an available dinner is full',async()=>{
 const c=bookingConversation([]);await c.send(`reservar para 5 personas el ${bookingDay}`);
 let r=await c.send('21:00');assert.equal(r.state,'booking_time');assert.equal(r.draft.date,bookingDay);assert.equal(r.draft.party,5);
 r=await c.send('que horas hay');assert.equal(r.state,'booking_time');assert.match(r.reply,/No quedan huecos/);assert.equal(r.draft.date,bookingDay);
 r=await c.send('otro día');assert.equal(r.state,'booking_date');assert.equal(r.draft.party,5);
 c.setSlots(dinnerSlots);r=await c.send(bookingDates.addCalendarDays(bookingDay,1));assert.equal(r.state,'booking_time');assert.match(r.reply,/20:00/);
});

test('dinner alternatives never include morning or lunch, while an explicit service change is accepted',async()=>{
 const c=bookingConversation(daySlots);await askBookingTime(c,'quiero reservar para cenar');
 let r=await c.send('q horas hay');assert.ok(r.draft.slots.every(s=>s.service==='cena'));assert.doesNotMatch(r.reply,/12:30|13:00|15:00/);
 r=await c.send('mejor para comer');assert.ok(r.draft.slots.every(s=>s.service==='comida'));assert.equal(r.draft.date,bookingDay);
 r=await c.send('para cenar');assert.ok(r.draft.slots.every(s=>s.service==='cena'));assert.equal(r.draft.date,bookingDay);
});

test('later and earlier requests consult fresh slots and respect the meal',async()=>{
 const c=bookingConversation(daySlots);await askBookingTime(c,'reservar para cenar');await c.send('que horas hay');
 let r=await c.send('más tarde');assert.deepEqual(r.draft.slots.map(s=>s.time),['22:00','22:30']);
 c.setSlots(daySlots.filter(s=>s.time!=='21:30'));r=await c.send('más temprano');
 assert.ok(r.draft.slots.every(s=>s.service==='cena'&&s.time<'22:00'&&s.time!=='21:30'));
 assert.equal(c.calls.created.length,0);
});

test('date and party changes during time selection refresh availability instead of reusing stale slots',async()=>{
 const c=bookingConversation(dinnerSlots);await c.send(`reservar para 5 personas el ${bookingDay}`);await c.send('que horas hay');
 let r=await c.send('mejor somos seis');assert.equal(r.draft.party,6);assert.equal(c.calls.availability.at(-1)[1],6);
 const date=bookingDates.addCalendarDays(bookingDay,1);r=await c.send(`mejor el ${date}`);assert.equal(r.draft.date,date);
 assert.equal(c.calls.availability.at(-1)[0],date);assert.match(r.reply,/20:00/);assert.equal(c.calls.created.length,0);
});

test('an invalid party correction cannot become a customer name or a confirmed booking',async()=>{
 const c=bookingConversation(dinnerSlots);await c.send(`reservar para 5 personas el ${bookingDay} a las 21:00`);
 let r=await c.send('somos 0','live');assert.equal(r.state,'booking_party');assert.equal(c.calls.created.length,0);
 r=await c.send('4');assert.equal(r.state,'booking_name');await c.send('Cliente');
 r=await c.send('no somos 0','live');assert.equal(r.state,'booking_party');assert.equal(c.calls.created.length,0);
});

test('a single diner is not a request to speak with a human, but an explicit handoff still is',async()=>{
 const c=bookingConversation(dinnerSlots);let r=await c.send('una reserva para una persona hoy');
 assert.equal(r.state,'booking_time');assert.equal(r.draft.party,1);assert.equal(r.handoff,false);
 r=await c.send('quiero hablar con una persona');assert.equal(r.handoff,true);
 r=await c.send('hola');assert.equal(r.suppressDelivery,true);
 const routed=routing.selectChatbotRestaurant('una reserva en Local A para una persona hoy',[{id:a,name:'Local A',code:'local-a',mode:'live'}],null);
 assert.equal(routed.engineText,'reservar para 1 personas hoy');
});

test('FAQ typos and questions during a booking keep the draft and never invent a name',async()=>{
 const c=bookingConversation(dinnerSlots,{getOpeningHours:async()=> 'Horario consultado'});await c.send(`reservar para 5 personas el ${bookingDay} a las 21:00`);
 for(const text of ['orarios','horarios','donde estais?','carya','carta']) {
  const r=await c.send(text);assert.equal(r.state,'booking_name');assert.equal(r.draft.name,undefined);assert.equal(r.draft.time,'21:00');
  assert.doesNotMatch(r.reply,/soy el asistente|Escribe RESERVAR/);
 }
 let r=await c.send('¿Tenéis aparcamiento?');assert.equal(r.state,'booking_name');assert.equal(r.draft.name,undefined);assert.match(r.reply,/No tengo ese dato/);
 r=await c.send('Domingo');assert.equal(r.state,'booking_confirm');assert.equal(r.draft.name,'Domingo');assert.equal(r.draft.date,bookingDay);
 r=await c.send('carta');assert.equal(r.state,'booking_confirm');assert.match(r.reply,/Son correctos/);assert.equal(c.calls.created.length,0);
});

test('weekdays and tonight are preserved across selection and parsed in the restaurant timezone',async()=>{
 const c=bookingConversation(dinnerSlots);let r=await c.send('reservar para cinco personas el viernes a las 21:00');
 assert.equal(r.state,'booking_name');assert.equal(new Date(r.draft.date+'T12:00:00Z').getUTCDay(),5);
 const d=bookingConversation(dinnerSlots);r=await d.send('reservar para dos personas esta noche');
 assert.equal(r.draft.date,bookingDates.dateInTimezone('Europe/Madrid'));assert.equal(r.draft.service,'cena');
 await reset();await send(payload('que horas hay el viernes para cinco personas'));await send(payload('local-b'));
 assert.equal(engineCalls.at(-1).text,'disponibilidad para 5 personas viernes');
});

const ownedReservation={id:'owned',managementToken:'owned-token',name:'Cliente',party:5,start:makeSlot('20:00','cena').start};
function managedConversation(overrides={}) {
 const cancelled=[],changed=[];
 const c=bookingConversation(dinnerSlots,{
  listUpcomingReservations:async()=>[ownedReservation],
  cancelReservation:async token=>{cancelled.push(token);},
  rescheduleReservation:async (...args)=>{changed.push(args);},...overrides,
 });return {c,cancelled,changed};
}

test('cancel requests ask a natural confirmation and a no leaves the existing reservation intact',async()=>{
 for(const answer of ['sí','correcto','vale','confirmar cancelacion']) {
  const {c,cancelled}=managedConversation();let r=await c.send('quiero cancelar mi reserva','live');
  assert.equal(r.state,'cancel_confirm');assert.match(r.reply,/Quieres que cancele/);assert.doesNotMatch(r.reply,/exactamente|CONFIRMAR/);assert.equal(cancelled.length,0);
  r=await c.send(answer,'live');assert.equal(r.action,'booking_cancelled');assert.deepEqual(cancelled,['owned-token']);
  await c.send(answer,'live');assert.equal(cancelled.length,1);
 }
 const {c,cancelled}=managedConversation();await c.send('cancelar mi reserva');let r=await c.send('no','live');
 assert.equal(r.state,'idle');assert.match(r.reply,/No he cancelado/);assert.equal(cancelled.length,0);
});

test('management selection does not swallow cancel as merely exiting the conversation',async()=>{
 const {c,cancelled}=managedConversation();let r=await c.send('mis reservas');assert.equal(r.state,'manage_action');
 r=await c.send('cancelar');assert.equal(r.state,'cancel_confirm');assert.equal(cancelled.length,0);
 await c.send('sí','live');assert.equal(cancelled.length,1);
});

test('rescheduling keeps requested date and time, allows correction, then requires a new yes',async()=>{
 const {c,changed}=managedConversation();let r=await c.send(`cambiar mi reserva al ${bookingDay} a las 21:00`,'live');
 assert.equal(r.state,'reschedule_confirm');assert.match(r.reply,/Son correctos/);assert.equal(changed.length,0);
 r=await c.send('no','live');assert.equal(r.state,'reschedule_time');assert.equal(changed.length,0);
 r=await c.send('mejor a las 21:30','live');assert.equal(r.state,'reschedule_confirm');assert.equal(r.draft.time,'21:30');
 r=await c.send('correcto','live');assert.equal(r.action,'booking_rescheduled');assert.deepEqual(changed,[['owned-token',makeSlot('21:30','cena').start]]);
});

test('rescheduling just the time uses the owned reservation day and excludes only that reservation',async()=>{
 const {c,changed}=managedConversation();let r=await c.send('cambiar mi reserva a las 21:00');assert.equal(r.state,'reschedule_confirm');
 assert.equal(r.draft.date,bookingDay);assert.deepEqual(c.calls.availability.at(-1),[bookingDay,5,'owned']);
 r=await c.send('sí','live');assert.equal(r.action,'booking_rescheduled');assert.equal(changed.length,1);
});

test('rescheduling availability questions keep ownership and recheck full slots before confirmation',async()=>{
 const {c,changed}=managedConversation();await c.send('cambiar mi reserva');let r=await c.send(`que horas hay el ${bookingDay}?`);
 assert.equal(r.state,'reschedule_time');assert.deepEqual(c.calls.availability.at(-1),[bookingDay,5,'owned']);
 r=await c.send('21:00');assert.equal(r.state,'reschedule_confirm');c.setSlots(dinnerSlots.filter(s=>s.time!=='21:00'));
 r=await c.send('sí','live');assert.equal(r.state,'reschedule_time');assert.equal(changed.length,0);
 assert.equal(r.draft.selectedReservation.managementToken,'owned-token');assert.equal(r.draft.date,bookingDay);
});

test('multiple owned reservations require selection and cannot mutate by incidental numbers',async()=>{
 const {c,cancelled}=managedConversation({listUpcomingReservations:async()=>[ownedReservation,{...ownedReservation,id:'second',managementToken:'second-token'}]});
 let r=await c.send('cancelar mi reserva');assert.equal(r.state,'manage_select');
 r=await c.send('9');assert.equal(r.state,'manage_select');assert.equal(cancelled.length,0);
 r=await c.send('2');assert.equal(r.state,'cancel_confirm');await c.send('sí','live');assert.deepEqual(cancelled,['second-token']);
});

test('opening ranges and closures stay scoped to the same restaurant used for availability',async()=>{
 const {readChatbotServiceRanges}=compile('../app/lib/chatbotHours.ts');
 const weekday=new Date(bookingDay+'T12:00:00Z').getUTCDay();
 const rows=[scheduleRow(a,weekday,'13:00','16:00'),scheduleRow(a,weekday,'20:00','23:30','cena'),scheduleRow(b,weekday,'07:00','10:00','desayuno')];
 const db=hoursDb(rows,[{restaurante_id:a,fecha:bookingDay,tipo:'cierre',hora_inicio:'14:00',hora_fin:'15:00'}]);
 const ranges=await readChatbotServiceRanges(db,a,bookingDay);
 assert.deepEqual(ranges,[{service:'comida',start:'13:00',end:'14:00'},{service:'comida',start:'15:00',end:'16:00'},{service:'cena',start:'20:00',end:'23:30'}]);
 assert.ok(db.calls.every(call=>call.filters.restaurante_id===a));
});

test('names and email addresses containing a date are values, while explicit date corrections still work',async()=>{
 for(const name of ['Control Conversación A 12-09','Grupo 14-09','Domingo','Domingo Pérez','a nombre de Domingo']) {
  const c=bookingConversation(dinnerSlots);await c.send(`reservar para 5 personas el ${bookingDay} a las 21:00`);
  const r=await c.send(name);assert.equal(r.state,'booking_confirm',name);assert.equal(r.draft.date,bookingDay);
  assert.equal(r.draft.name,name.replace('a nombre de ',''));
 }
 const c=bookingConversation(dinnerSlots,{}, {...bookingRestaurant,requiresEmail:true});
 await c.send(`reservar para 5 personas el ${bookingDay} a las 21:00`);await c.send('Cliente');
 let r=await c.send('12-09@example.invalid');assert.equal(r.state,'booking_confirm');assert.equal(r.draft.email,'12-09@example.invalid');assert.equal(r.draft.date,bookingDay);
 const d=bookingConversation(dinnerSlots);await d.send(`reservar para 5 personas el ${bookingDay} a las 21:00`);
 const date=bookingDates.addCalendarDays(bookingDay,1);r=await d.send(`mejor el ${date}`);assert.equal(r.state,'booking_name');assert.equal(r.draft.date,date);
});
