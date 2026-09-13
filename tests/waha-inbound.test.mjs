import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import ts from 'typescript';
import {NextRequest} from 'next/server.js';
import * as contract from '../lib/whatsapp/waha-contract.mjs';

const require=createRequire(import.meta.url);
function compile(file,imports){
 const compiled={exports:{}};
 const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name=>name in imports?imports[name]:require(name),compiled,compiled.exports);
 return compiled.exports;
}
const secret='isolated-waha-fixture-secret-at-least-32-bytes';
process.env.WAHA_WEBHOOK_SECRET=secret;
process.env.N8N_CHATBOT_WEBHOOK_SECRET='isolated-engine-secret';
const aid='73000000-0000-4000-8000-000000000001',bid='73000000-0000-4000-8000-000000000002';
const makeChannel=(id,rid,number)=>({id,restaurante_id:rid,session_name:'gh_'+id.replaceAll('-',''),phone_e164:number,status:'WORKING',enabled:true,chatbot_enabled:true,reviews_enabled:false,generation:2,revision:1,activated_at:new Date(Date.now()-60_000).toISOString()});
let channels,ledger,paused,sends,engineCalls,committed,providerPhones,providerRestricted,cacheFails,sendOutcome,lidPhone,swapAfterEngine;
function reset(){
 channels=[makeChannel(aid,'restaurant-a','+34600000001'),makeChannel(bid,'restaurant-b','+34600000002')];
 ledger=new Map();paused=new Set();sends=[];engineCalls=[];committed=new Map();providerPhones=new Map(channels.map(c=>[c.session_name,c.phone_e164.slice(1)]));
 providerRestricted=false;cacheFails=0;sendOutcome='accepted';lidPhone=null;swapAfterEngine=false;
}
reset();
const db={};
const rowById=id=>[...ledger.values()].find(row=>row.id===id);
const store={
 getWahaChannelBySession:async(_db,session)=>structuredClone(channels.find(c=>c.session_name===session)||null),
 updateWahaChannel:async(_db,id,patch,generation,revision)=>{const c=channels.find(c=>c.id===id);if(c.generation!==generation||c.revision!==revision)return null;Object.assign(c,patch);c.revision++;return structuredClone(c);},
 stageWahaInbound:async()=>({id:'staged'}),
 claimWahaMessage:async(_db,input)=>{
  const key=input.channelId+':'+input.messageId;
  let row=ledger.get(key);
  if(row?.status==='sent'||row?.status==='suppressed')return {status:'duplicate'};
  if(row?.status==='uncertain')return {status:'blocked'};
  if(!row){row={id:'row-'+ledger.size,status:'processing',engine_response:null,reserved_outgoing_id:null,...input};ledger.set(key,row);}
  return {status:'acquired',message:structuredClone(row),lockToken:'lock'};
 },
 cacheWahaResponse:async(_db,id,_lock,response)=>{if(cacheFails-->0)throw new Error('crash after engine commit');const row=rowById(id);row.engine_response=structuredClone(response);row.status=response.suppressDelivery?'suppressed':'ready';return true;},
 reserveWahaOutgoingId:async(_db,id,_lock,outgoing)=>{rowById(id).reserved_outgoing_id=outgoing;return true;},
 beginWahaSend:async(_db,id)=>{rowById(id).status='sending';return true;},
 finishWahaSend:async(_db,id,_lock,result)=>{const row=rowById(id);row.status=result.outcome==='blocked'?'suppressed':result.outcome;row.outgoing_message_id=result.providerMessageId;return true;},
 failWahaMessage:async(_db,id)=>{rowById(id).status='failed';return true;},
 knownWahaOutgoingMessage:async(_db,channelId,raw)=>[...ledger.values()].find(row=>row.channelId===channelId&&row.reserved_outgoing_id===raw)||null,
 recordWahaAck:async()=>null,
 isWahaContactPaused:async(_db,id,phone)=>paused.has(id+phone),
 pauseWahaContact:async(_db,id,phone)=>{paused.add(id+phone);return true;},
};
const provider={
 wahaConfigured:()=>false,
 getWahaSession:async session=>({name:session,status:'WORKING',phone:providerPhones.get(session),restricted:providerRestricted}),
 resolveWahaPhone:async()=>lidPhone,
 getWahaNewMessageId:async()=>`RESERVEDMSG${sends.length+1}`,
 sendWahaText:async input=>{assert.ok([...ledger.values()].some(row=>row.reserved_outgoing_id===input.id&&row.status==='sending'));sends.push(input);return {status:sendOutcome,messageId:sendOutcome==='accepted'?`true_${input.chatId}_${input.id}`:null,error:sendOutcome==='uncertain'?'TIMEOUT':null};},
};
const engine={POST:async request=>{
 const body=await request.json();engineCalls.push(body);
 assert.equal(request.headers.get('x-gastrohelp-webhook-secret'),process.env.N8N_CHATBOT_WEBHOOK_SECRET);
 if(committed.has(body.messageId))return Response.json({ok:true,duplicate:true,suppressDelivery:true,originalResponse:committed.get(body.messageId)});
 const response={ok:true,reply:'Reserva confirmada',suppressDelivery:false};committed.set(body.messageId,response);
 if(swapAfterEngine)providerPhones.set(channels.find(c=>c.restaurante_id===body.restaurantId).session_name,'34699999999');
 return Response.json(response);
}};
const inbound=compile('../lib/whatsapp/waha-inbound.ts',{
 'server-only':{},'@/app/lib/supabaseAdmin':{getSupabaseAdmin:()=>db},'@/app/api/chatbot/messages/route':engine,
 '@/lib/whatsapp/waha-contract.mjs':contract,'@/lib/whatsapp/waha-api':provider,'@/lib/whatsapp/waha-store':store,
 '@/lib/reviews/waha-review-delivery':{reconcileWahaReviewAck:async()=>{}},
});
const route=compile('../app/api/whatsapp/waha/webhook/route.ts',{'@/lib/whatsapp/waha-contract.mjs':contract,'@/lib/whatsapp/waha-inbound':inbound});
function payload(channel=channels[0],extras={}){
 return {id:'evt_12345',timestamp:Date.now(),session:channel.session_name,event:'message.any',restaurantId:'untrusted-restaurant',
  payload:{id:'false_447700900135@c.us_CUSTOMERMSG1',from:'447700900135@c.us',to:channel.phone_e164.slice(1)+'@c.us',fromMe:false,body:'sí, correcto',timestamp:Math.floor(Date.now()/1000),...extras}};
}
async function send(value,valid=true){
 const raw=JSON.stringify(value);const signature=createHmac('sha512',valid?secret:'wrong-secret').update(raw).digest('hex');
 const response=await route.POST(new NextRequest('https://panel.invalid/api/whatsapp/waha/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Webhook-Hmac':signature,'X-Webhook-Hmac-Algorithm':'sha512'},body:raw}));
 return {code:response.status,...await response.json()};
}

test('signed channel owns restaurant selection; same customer is independent across two numbers',async()=>{
 reset();assert.equal((await send(payload(channels[0]))).status,'ACCEPTED');assert.equal((await send(payload(channels[1]))).status,'ACCEPTED');
 assert.deepEqual(engineCalls.map(x=>x.restaurantId),['restaurant-a','restaurant-b']);
 assert.ok(engineCalls.every(x=>x.mode==='live'&&x.from==='+447700900135'));
 assert.notEqual(engineCalls[0].messageId,engineCalls[1].messageId);
 assert.deepEqual(sends.map(x=>x.session),channels.map(c=>c.session_name));
});
test('invalid signature, unknown connection, disabled service and old messages cannot invoke the engine',async()=>{
 reset();assert.equal((await send(payload(),false)).code,403);
 assert.equal((await send({...payload(),session:'gh_'+('f'.repeat(32))})).status,'UNKNOWN_CONNECTION');
 channels[0].enabled=false;assert.equal((await send(payload())).status,'CONNECTION_PAUSED');channels[0].enabled=true;
 assert.equal((await send(payload(channels[0],{timestamp:Math.floor(Date.now()/1000)-120}))).status,'OLD_MESSAGE');
 assert.equal(engineCalls.length,0);assert.equal(sends.length,0);
});
test('duplicate webhook sends once and timeout outcome is quarantined',async()=>{
 reset();const message=payload();await send(message);await send(message);assert.equal(engineCalls.length,1);assert.equal(sends.length,1);
 reset();sendOutcome='uncertain';const uncertain=payload();assert.equal((await send(uncertain)).status,'UNCERTAIN');await send(uncertain);assert.equal(sends.length,1);assert.equal(engineCalls.length,1);
});
test('crash after booking commit recovers cached engine reply without repeating booking',async()=>{
 reset();cacheFails=1;const message=payload();assert.equal((await send(message)).code,503);assert.equal(committed.size,1);assert.equal(sends.length,0);
 assert.equal((await send(message)).status,'ACCEPTED');assert.equal(committed.size,1);assert.equal(sends.length,1);assert.equal(engineCalls[0].messageId,engineCalls[1].messageId);
});
test('LID requires provider mapping and replies use verified phone',async()=>{
 reset();const message=payload(channels[0],{id:'false_123456789012345678@lid_LIDMSG123',from:'123456789012345678@lid'});
 assert.equal((await send(message)).status,'IDENTITY_PENDING');assert.equal(engineCalls.length,0);
 lidPhone='447700900135';assert.equal((await send(message)).status,'ACCEPTED');assert.equal(engineCalls[0].from,'+447700900135');assert.equal(sends[0].chatId,'447700900135@c.us');
});
test('phone mismatch, quota restriction and a number swap during engine work prevent sends',async()=>{
 reset();providerPhones.set(channels[0].session_name,'34699999999');assert.equal((await send(payload())).code,503);assert.equal(engineCalls.length,0);
 reset();providerRestricted=true;assert.equal((await send(payload())).code,503);assert.equal(sends.length,0);
 reset();swapAfterEngine=true;assert.equal((await send(payload())).code,503);assert.equal(committed.size,1);assert.equal(sends.length,0);
});
test('own bot echo is ignored; manual reply pauses only its restaurant/customer',async()=>{
 reset();await send(payload());const reply=sends[0];
 let message=payload(channels[0],{id:`true_447700900135@c.us_${reply.id}`,fromMe:true,from:'34600000001@c.us',to:'447700900135@c.us',body:'Reserva confirmada'});
 assert.equal((await send(message)).status,'BOT_ECHO');assert.equal(paused.size,0);
 message=payload(channels[0],{id:'true_447700900135@c.us_HUMANMSG123',fromMe:true,from:'34600000001@c.us',to:'447700900135@c.us',body:'Te atiendo yo'});
 assert.equal((await send(message)).status,'HUMAN_REPLY');assert.equal(paused.size,1);
 assert.equal((await send(payload())).status,'HUMAN_HANDOFF');assert.equal((await send(payload(channels[1]))).status,'ACCEPTED');
});
test('status callback cannot restart an explicitly disconnected channel',async()=>{
 reset();channels[0].status='STOPPED';channels[0].enabled=false;
 const event={id:'evt_status_1',timestamp:Date.now(),session:channels[0].session_name,event:'session.status',payload:{status:'WORKING'}};
 assert.equal((await send(event)).status,'CONNECTION_STOPPED');assert.equal(channels[0].status,'STOPPED');assert.equal(channels[0].enabled,false);
});
