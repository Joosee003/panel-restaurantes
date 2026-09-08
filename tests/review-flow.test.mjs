import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve,dirname } from 'node:path';
import ts from 'typescript';
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
const event={event_id:'visit.review_request:'+token,restaurante_id:'fixture-restaurant',lock_token:token};
const allowed={allowed:true,token,name:'Cliente Prueba',phone:'600 000 001',restaurantName:'Restaurante de prueba',deliveryMode:'live'};
const env={WHATSAPP_ACCESS_TOKEN:'not-a-real-token',WHATSAPP_PHONE_NUMBER_ID:'123456',WHATSAPP_GRAPH_VERSION:'v99.0',WHATSAPP_REVIEW_TEMPLATE_NAME:'review_fixture',WHATSAPP_REVIEW_TEMPLATE_LANGUAGE:'es',WHATSAPP_REVIEW_RESTAURANT_IDS:event.restaurante_id};
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
test('No live delivery occurs without credentials and an explicit restaurant allowlist',async()=>{
 assert.equal(delivery.reviewWhatsAppConfigured(env,'other'),false);
 const state=mockRpc(allowed);const result=await delivery.deliverVisitReview(event,state.rpc,{},forbidden);
 assert.equal(result.status,'blocked');assert.equal(state.calls[1].args.p_error,'whatsapp_not_configured');
});
test('Test delivery does not contact Meta or claim a real send',async()=>{
 const state=mockRpc({...allowed,deliveryMode:'test'});
 assert.equal((await delivery.deliverVisitReview(event,state.rpc,env,forbidden)).status,'test');
 assert.equal(state.calls[1].args.p_message_id,null);
});
test('A current SQL recheck can cancel delivery before any external call',async()=>{
 const state=mockRpc({allowed:false,reason:'review_consent_missing'});
 assert.equal((await delivery.deliverVisitReview(event,state.rpc,env,forbidden)).status,'blocked');
});
test('The template carries only the opaque link suffix and records the provider acceptance ID',async()=>{
 const state=mockRpc(allowed);let calls=0;
 const transport=async(url,options)=>{calls++;assert.equal(url,'https://graph.facebook.com/v99.0/123456/messages');
  const body=JSON.parse(options.body);assert.equal(body.to,'34600000001');assert.equal(body.type,'template');
  assert.deepEqual(body.template.components[1],{type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:token}]});
  assert.equal(body.template.components[0].parameters[1].text,allowed.restaurantName);
  assert.equal(options.redirect,'error');return Response.json({messages:[{id:'wamid.fixture'}]});};
 assert.equal((await delivery.deliverVisitReview(event,state.rpc,env,transport)).status,'accepted_by_whatsapp');
 assert.equal(calls,1);assert.equal(state.calls[1].args.p_message_id,'wamid.fixture');
});
test('Timeouts, provider server errors and empty acknowledgements become uncertain without a retry',async()=>{
 for(const transport of [async()=>{throw new Error('timeout');},async()=>new Response('',{status:503}),async()=>Response.json({ok:true})]) {
  const state=mockRpc(allowed);assert.equal((await delivery.deliverVisitReview(event,state.rpc,env,transport)).status,'uncertain');
  assert.equal(state.calls[1].args.p_outcome,'uncertain');assert.equal(state.calls.length,2);
 }
});
test('A duplicate current worker never completes or resends another in-flight message',async()=>{
 const state=mockRpc({allowed:false,reason:'review_delivery_in_progress'});
 assert.equal((await delivery.deliverVisitReview(event,state.rpc,env,forbidden)).status,'skipped');assert.equal(state.calls.length,1);
});
test('Failed recording of provider acceptance never falls into the generic retry path',async()=>{
 const state=mockRpc(allowed,false);let calls=0;
 assert.equal((await delivery.deliverVisitReview(event,state.rpc,env,async()=>{calls++;return Response.json({messages:[{id:'wamid.fixture'}]});})).status,'needs_review');
 assert.equal(calls,1);assert.equal(state.calls.length,2);
});
