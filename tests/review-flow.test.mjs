import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve,dirname } from 'node:path';
import ts from 'typescript';
import { prepareReviewWebhook, reviewProviderReceipt } from '../lib/reviews/n8n-review-contract.mjs';
const require=createRequire(import.meta.url);
const cache=new Map();
function load(file) {
 file=resolve(file);if(cache.has(file))return cache.get(file);
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const loaded={exports:{}};cache.set(file,loaded.exports);
 new Function('require','module','exports',code)((name)=>name.startsWith('.')?load(resolve(dirname(file),name+'.ts')):require(name),loaded,loaded.exports);
 return loaded.exports;
}
const flow=load('lib/reviews/review-flow.ts');
const delivery=load('lib/reviews/review-delivery.ts');
const token='76000000-0000-4000-8000-000000000001';
const event={event_id:'visit.review_request:'+token,restaurante_id:'72000000-0000-4000-8000-000000000001',lock_token:token};
const allowed={allowed:true,token,name:'Cliente Prueba',phone:'600 000 001',restaurantName:'Restaurante de prueba',deliveryMode:'live'};
const env={N8N_REVIEW_WEBHOOK_URL:'https://n8n.gastrohelp.es/webhook/review-fixture',N8N_REVIEW_WEBHOOK_SECRET:'not-a-real-secret',WHATSAPP_REVIEW_RESTAURANT_IDS:event.restaurante_id};
const accepted={ok:true,eventId:event.event_id,deliveryMode:'live',provider:'whatsapp',outcome:'sent',messageId:'wamid.fixture'};
const forbidden=()=>{throw new Error('Unexpected external message');};
const mockRpc=(context,finish=true)=>{const calls=[];return {calls,rpc:async(name,args)=>{calls.push({name,args});return {data:name==='get_visit_review_delivery'?context:finish,error:null};}};};
test('Google URLs reject credentials, unsafe protocols, lookalike hosts and unrelated Google paths',()=>{
 for(const url of ['https://g.page/r/a/review','https://www.google.es/maps/place/Test','https://search.google.com/local/writereview?placeid=a','https://maps.app.goo.gl/fixture'])assert.ok(flow.googleReviewUrl(url));
 for(const url of ['javascript:alert(1)','http://g.page/x','https://google.com.evil.invalid/maps','https://user:pass@google.com/maps','https://www.google.com/url?q=evil','https://google.com/mapsevil','https://g.page:444/x'])assert.equal(flow.googleReviewUrl(url),null);
});
test('Phone normalization supports Spanish and international numbers without accepting arbitrary text',()=>{
 assert.equal(flow.whatsappPhone('600 000 001'),'34600000001');assert.equal(flow.whatsappPhone('+44 7700 900001'),'447700900001');
 assert.equal(flow.whatsappPhone('0034 600000001'),'34600000001');assert.equal(flow.whatsappPhone('unknown'),null);
});
test('An opened Google link is not a confirmed review and an uncertain send cannot be prepared again',()=>{
 const request={confirmed:false,sent_at:'2026-01-01T00:00:00Z',google_opened_at:'2026-01-01T01:00:00Z',status:'sent',consent:true,telefono:'600000001',scheduled_for:'2026-01-01T00:00:00Z'};
 assert.equal(flow.reviewStage(request).key,'opened');assert.equal(flow.canPrepareReview(request),false);
 assert.equal(flow.reviewStage({...request,confirmed:true}).key,'confirmed');
 assert.equal(flow.canPrepareReview({...request,sent_at:null,google_opened_at:null,status:'uncertain'}),false);
 assert.equal(flow.canPrepareReview({...request,sent_at:null,google_opened_at:null,status:'ready',consent:false}),false);
});
test('No live delivery occurs without a webhook secret and an explicit restaurant allowlist',async()=>{
 assert.equal(delivery.reviewWhatsAppConfigured(env,event.restaurante_id),true);
 assert.equal(delivery.reviewWhatsAppConfigured(env,'other'),false);
 assert.equal(delivery.reviewWhatsAppConfigured({...env,WHATSAPP_REVIEW_RESTAURANT_IDS:''},''),false);
 for(const missing of [{},{...env,N8N_REVIEW_WEBHOOK_SECRET:''},{...env,WHATSAPP_REVIEW_RESTAURANT_IDS:''},{...env,N8N_REVIEW_WEBHOOK_SECRET:'bad\r\nheader'}]) {
  const state=mockRpc(allowed);const result=await delivery.deliverVisitReview(event,state.rpc,missing,forbidden);
  assert.equal(result.status,'blocked');assert.equal(state.calls[1].args.p_error,'whatsapp_not_configured');
 }
});
test('Unsafe webhook destinations never receive a request or customer data',async()=>{
 for(const url of ['http://n8n.gastrohelp.es/webhook/review','https://n8n.gastrohelp.es.evil.invalid/webhook/review','https://n8n.gastrohelp.es:444/webhook/review','https://user:pass@n8n.gastrohelp.es/webhook/review','https://n8n.gastrohelp.es/webhook/review?secret=bad','https://n8n.gastrohelp.es/webhook/review#other','https://n8n.gastrohelp.es/webhook/review?','https://n8n.gastrohelp.es/webhook/review#','https://n8n.gastrohelp.es/webhook-test/review','https://n8n.gastrohelp.es/webhook/','not a URL']) {
  const state=mockRpc(allowed);
  assert.equal((await delivery.deliverVisitReview(event,state.rpc,{...env,N8N_REVIEW_WEBHOOK_URL:url},forbidden)).status,'blocked',url);
  assert.equal(state.calls[1].args.p_error,'whatsapp_not_configured');
 }
 assert.equal(delivery.reviewWhatsAppConfigured({...env,N8N_REVIEW_WEBHOOK_URL:'https://n8n.gastrohelp.es:443/webhook/review'},event.restaurante_id),true);
});
test('Test delivery does not contact n8n or claim a real send',async()=>{
 const state=mockRpc({...allowed,deliveryMode:'test'});
 assert.equal((await delivery.deliverVisitReview(event,state.rpc,env,forbidden)).status,'test');
 assert.equal(state.calls[1].args.p_message_id,null);
 assert.equal((await delivery.sendReviewTemplate(event,{...allowed,deliveryMode:'test'},env,forbidden)).outcome,'blocked');
});
test('A current SQL recheck can cancel delivery before any external call',async()=>{
 const state=mockRpc({allowed:false,reason:'review_consent_missing'});
 assert.equal((await delivery.deliverVisitReview(event,state.rpc,env,forbidden)).status,'blocked');
});
test('n8n receives the verified visit request with correlation headers and returns the provider acceptance ID',async()=>{
 const state=mockRpc(allowed);let calls=0;
 const transport=async(url,options)=>{calls++;assert.equal(url,env.N8N_REVIEW_WEBHOOK_URL);
  assert.equal(options.method,'POST');assert.deepEqual(options.headers,{
   'Content-Type':'application/json','X-GastroHelp-Webhook-Secret':env.N8N_REVIEW_WEBHOOK_SECRET,
   'X-GastroHelp-Automation-Event':event.event_id,'X-GastroHelp-Delivery-Mode':'live',
  });
  assert.deepEqual(JSON.parse(options.body),{
   event:'visit.review_request',automationEventId:event.event_id,restaurantId:event.restaurante_id,
   deliveryMode:'live',whatsappAllowed:true,
   review:{token,name:'Cliente',phone:'34600000001',restaurantName:allowed.restaurantName},
  });
  assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);
  return Response.json(accepted);};
 assert.equal((await delivery.deliverVisitReview(event,state.rpc,env,transport)).status,'accepted_by_whatsapp');
 assert.equal(calls,1);assert.equal(state.calls[1].args.p_message_id,'wamid.fixture');
});
test('A correlated blocked result is recorded without claiming a WhatsApp send',async()=>{
 for(const status of [200,422]) {
  const state=mockRpc(allowed);
  const transport=async()=>Response.json({ok:false,eventId:event.event_id,deliveryMode:'live',outcome:'blocked',error:'template_not_configured'},{status});
  assert.equal((await delivery.deliverVisitReview(event,state.rpc,env,transport)).status,'blocked');
  assert.equal(state.calls[1].args.p_error,'template_not_configured');assert.equal(state.calls[1].args.p_message_id,null);
 }
});
test('The real panel and n8n contracts preserve accepted, uncertain and inactive outcomes end to end',async()=>{
 const settings={enabled:true,templateApproved:true,restaurantIds:[event.restaurante_id],phoneNumberId:'123456',templateName:'review_fixture',language:'es'};
 for(const scenario of [
  {provider:{messages:[{id:'wamid.fixture',message_status:'accepted'}]},status:'accepted_by_whatsapp',outcome:'sent'},
  {provider:{messages:[{id:'wamid.fixture',message_status:'held_for_quality_assessment'}]},status:'uncertain',outcome:'uncertain'},
  {provider:{ok:true},status:'uncertain',outcome:'uncertain'},
  {inactive:true,status:'blocked',outcome:'blocked'},
 ]) {
  const state=mockRpc(allowed);let webhookCalls=0;let providerCalls=0;
  const transport=async(_url,options)=>{
   webhookCalls++;
   const request=prepareReviewWebhook({body:JSON.parse(options.body),headers:Object.fromEntries(new Headers(options.headers))},{...settings,enabled:!scenario.inactive});
   if(!request.send)return Response.json(request);
   providerCalls++;
   return Response.json(reviewProviderReceipt(scenario.provider,request));
  };
  assert.equal((await delivery.deliverVisitReview(event,state.rpc,env,transport)).status,scenario.status);
  assert.equal(webhookCalls,1);assert.equal(providerCalls,scenario.inactive?0:1);
  assert.equal(state.calls[1].args.p_outcome,scenario.outcome);
  assert.equal(state.calls[1].args.p_message_id,scenario.outcome==='sent'?'wamid.fixture':null);
 }
});
test('A webhook 200 acceptance, mismatched event, test ACK or malformed provider ID never counts as sent',async()=>{
 for(const ack of [
  {ok:true},{...accepted,outcome:'accepted'},{...accepted,eventId:'another-event'},
  {...accepted,deliveryMode:'test'},{...accepted,provider:'email'},
  {...accepted,messageId:undefined},{...accepted,messageId:'accepted-by-n8n'},
  {...accepted,messageId:'wamid.bad id'},{...accepted,ok:false},null,
  {ok:false,eventId:'another-event',deliveryMode:'live',outcome:'blocked',error:'blocked'},
 ]) {
  const state=mockRpc(allowed);let calls=0;
  const result=await delivery.deliverVisitReview(event,state.rpc,env,async()=>{calls++;return Response.json(ack);});
  assert.equal(result.status,'uncertain',JSON.stringify(ack));assert.equal(calls,1);
  assert.equal(state.calls[1].args.p_message_id,null);assert.equal(state.calls[1].args.p_outcome,'uncertain');
 }
});
test('Lost acknowledgement after provider acceptance and HTTP failures stay uncertain without a retry',async()=>{
 for(const response of [
  ()=>{throw new DOMException('ACK lost after WhatsApp accepted','TimeoutError');},
  ()=>new Response('',{status:503}),()=>Response.json(accepted,{status:500}),
  ()=>new Response('unauthorized',{status:401}),()=>new Response('<html>accepted</html>'),
 ]) {
  const state=mockRpc(allowed);let calls=0;
  const transport=async()=>{calls++;return response();};
  assert.equal((await delivery.deliverVisitReview(event,state.rpc,env,transport)).status,'uncertain');
  assert.equal(calls,1);assert.equal(state.calls[1].args.p_outcome,'uncertain');assert.equal(state.calls.length,2);
 }
 const uncertain=mockRpc({allowed:false,reason:'review_delivery_uncertain'});
 assert.equal((await delivery.deliverVisitReview(event,uncertain.rpc,env,forbidden)).status,'uncertain');
});
test('A duplicate current worker never completes or resends another in-flight message',async()=>{
 const state=mockRpc({allowed:false,reason:'review_delivery_in_progress'});
 assert.equal((await delivery.deliverVisitReview(event,state.rpc,env,forbidden)).status,'skipped');assert.equal(state.calls.length,1);
});
test('Failed recording of provider acceptance never falls into the generic retry path',async()=>{
 const state=mockRpc(allowed,false);let calls=0;
 assert.equal((await delivery.deliverVisitReview(event,state.rpc,env,async()=>{calls++;return Response.json(accepted);})).status,'needs_review');
 assert.equal(calls,1);assert.equal(state.calls.length,2);
});
