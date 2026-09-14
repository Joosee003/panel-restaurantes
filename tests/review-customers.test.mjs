import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {create,act} from 'react-test-renderer';
import ts from 'typescript';

const require=createRequire(import.meta.url);
function compile(file,imports={}) {
  const module={exports:{}};
  const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','module','exports',code)(name=>imports[name]||require(name),module,module.exports);
  return module.exports;
}
const flow=compile('../lib/reviews/review-flow.ts');
const customers=compile('../lib/reviews/review-customers.ts',{'./review-flow':flow});
const {default:Panel}=compile('../app/(app)/resenas/ReviewRequestsPanelView.tsx',{'@/lib/reviews/review-flow':flow,'@/lib/reviews/review-customers':customers});
const original={window:globalThis.window,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
globalThis.window={setInterval:()=>1,clearInterval:()=>{}};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
after(()=>{globalThis.window=original.window;globalThis.IS_REACT_ACT_ENVIRONMENT=original.act;});
const row=(changes={})=>({id:'request-1',reserva_id:'visit-1',cliente_id:'customer-1',nombre:'Cliente de prueba',telefono:'+44 7700 900001',visit_at:'2026-09-10T10:00:00Z',scheduled_for:'2026-09-10T13:00:00Z',status:'sent',sent_at:'2026-09-10T13:01:00Z',google_opened_at:null,checked_at:null,confirmed:false,consent:true,last_error:null,previous_requests:0,...changes});
const fixture=requests=>({restaurantName:'Restaurante de prueba',settings:{google_review_url:'https://search.google.com/local/writereview?placeid=fixture',review_enabled:true,review_delay_hours:3,automation_ready:true},requests});
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.children?.map(text).join('')||'';
const button=(renderer,label)=>renderer.root.findAllByType('button').find(node=>text(node).trim().startsWith(label));
async function render(client,restauranteId='restaurant-a') {
  let renderer;
  await act(async()=>{renderer=create(React.createElement(Panel,{restauranteId,dark:false,client}),{createNodeMock:element=>element.type==='dialog'?{open:false,showModal(){this.open=true;},close(){this.open=false;}}:null});});
  return renderer;
}

test('several visits become one customer with all history and the correct sent visit to review',()=>{
  const old=row({reserva_id:'sent-visit'}),latest=row({reserva_id:'next-visit',visit_at:'2026-09-14T10:00:00Z',sent_at:null,status:'ready'});
  const input=[old,latest];const result=customers.groupReviewCustomers(input);
  assert.equal(result.length,1);assert.equal(result[0].latest.reserva_id,'next-visit');assert.equal(result[0].reviewRequest.reserva_id,'sent-visit');
  assert.equal(result[0].history.length,2);assert.equal(result[0].sentCount,1);assert.equal(result[0].category,'pending');
  assert.deepEqual(input,[old,latest]);
  assert.equal(customers.groupReviewCustomers([old,row({cliente_id:'different-customer'})]).length,2,'identical names and phones must not merge different customers');
});
test('opening Google cannot confirm a review or hide lost consent',()=>{
  const opened=row({google_opened_at:'2026-09-11T10:00:00Z'});
  const [pending]=customers.groupReviewCustomers([opened]);
  assert.equal(pending.category,'pending');assert.equal(pending.confirmed,false);assert.equal(customers.customerReviewStage(pending).label,'Enlace abierto');
  const [stopped]=customers.groupReviewCustomers([{...opened,consent:false,status:'cancelled',last_error:'review_consent_missing'}]);
  assert.equal(stopped.category,'stopped');assert.equal(customers.customerReviewStage(stopped).label,'Sin permiso');
  const [confirmed]=customers.groupReviewCustomers([{...opened,confirmed:true}]);
  assert.equal(confirmed.category,'confirmed');assert.equal(customers.customerReviewStage(confirmed).label,'Reseña confirmada');
});
test('WhatsApp uses only a valid normalized phone, with no message or sending action',()=>{
  assert.equal(customers.whatsappConversationUrl('600 000 001'),'https://wa.me/34600000001');
  assert.equal(customers.whatsappConversationUrl('+44 7700 900001'),'https://wa.me/447700900001');
  for(const bad of [null,'43434','sin teléfono','+34600000001?text=hola','javascript:alert(1)'])assert.equal(customers.whatsappConversationUrl(bad),null);
});
test('the manager link opens the business listing without changing the customer composer link',()=>{
  const composer='https://search.google.com/local/writereview?placeid=fixture';
  const listing=new URL(customers.googleBusinessUrl(composer,'Restaurante & prueba'));
  assert.equal(listing.origin+listing.pathname,'https://www.google.com/maps/search/');assert.equal(listing.searchParams.get('query_place_id'),'fixture');assert.equal(listing.searchParams.get('query'),'Restaurante & prueba');
  assert.equal(flow.googleReviewUrl(composer),composer);
  assert.equal(customers.googleBusinessUrl('https://g.page/r/fixture/review','Test'),'https://g.page/r/fixture');
  for(const bad of ['https://search.google.com/local/writereview','https://google.com.evil.invalid/maps','javascript:alert(1)'])assert.equal(customers.googleBusinessUrl(bad,'Test'),null);
});
test('the panel groups rows, offers a plain chat link and saves a check on the sent visit',async()=>{
  let data=fixture([row({reserva_id:'next-visit',visit_at:'2026-09-14T10:00:00Z',sent_at:null,status:'ready'}),row({reserva_id:'sent-visit'}),row({cliente_id:'no-phone',reserva_id:'no-phone-visit',telefono:'43434'})]);
  const calls=[];
  const client={channelConfigured:async()=>true,inspectGoogle:()=>{},rpc:async(name,args)=>{calls.push({name,args});return {data:name==='list_visit_review_requests'?data:{ok:true},error:null};}};
  const renderer=await render(client);
  assert.equal(renderer.root.findAllByType('article').length,2);
  const link=renderer.root.findAllByType('a').find(node=>node.props.href.startsWith('https://wa.me/'));
  assert.equal(link.props.href,'https://wa.me/447700900001');assert.equal(link.props.target,'_blank');assert.equal(link.props.onClick,undefined);
  assert.ok(button(renderer,'Sin teléfono válido').props.disabled);
  assert.equal(calls.filter(call=>call.name==='visit_review_action').length,0);
  const review=renderer.root.findAllByType('a').find(node=>text(node).trim()==='Revisar reseña');
  await act(async()=>review.props.onClick({preventDefault(){}}));
  assert.equal(calls.filter(call=>call.name==='visit_review_action').length,0,'opening review navigation does not confirm or send');
  await act(async()=>button(renderer,'Todavía no aparece').props.onClick());
  assert.deepEqual(calls.find(call=>call.name==='visit_review_action').args,{p_reserva_id:'sent-visit',p_action:'checked'});
  await act(async()=>renderer.root.findAllByType('a').find(node=>text(node).trim()==='Revisar reseña').props.onClick({preventDefault(){}}));
  data=fixture(data.requests.map(request=>request.cliente_id==='customer-1'?{...request,confirmed:true}:request));
  await act(async()=>button(renderer,'Sí, ya la ha dejado').props.onClick());
  assert.ok(button(renderer,'Corregir'));assert.equal(renderer.root.findAllByType('article').length,2);
  await act(async()=>button(renderer,'Confirmadas').props.onClick());assert.equal(renderer.root.findAllByType('article').length,1);
  await act(async()=>renderer.unmount());
});
test('filters and formatted-phone search preserve stopped customers and reveal an empty state',async()=>{
  const data=fixture([row(),row({cliente_id:'stopped',reserva_id:'stopped',consent:false,google_opened_at:'2026-09-11T10:00:00Z'})]);
  const renderer=await render({channelConfigured:async()=>false,rpc:async()=>({data,error:null})});
  await act(async()=>button(renderer,'Sin permiso').props.onClick());assert.equal(renderer.root.findAllByType('article').length,1);
  assert.match(text(renderer.root.findByType('article')),/Sin permiso/);
  await act(async()=>button(renderer,'Todos').props.onClick());
  const input=renderer.root.findAllByType('input').find(node=>node.props.type==='search');
  await act(async()=>input.props.onChange({target:{value:'447700900001'}}));assert.equal(renderer.root.findAllByType('article').length,2);
  await act(async()=>input.props.onChange({target:{value:'ninguno'}}));assert.equal(renderer.root.findAllByType('article').length,0);assert.ok(button(renderer,'Ver todos los clientes'));
  await act(async()=>button(renderer,'Ver todos los clientes').props.onClick());assert.equal(renderer.root.findAllByType('article').length,2);
  await act(async()=>renderer.unmount());
});
test('a late action from another restaurant cannot reopen its customer or overwrite the active panel',async()=>{
  let finish;
  const client={channelConfigured:async()=>true,inspectGoogle:()=>{},rpc:async(name,args)=>{
    if(name==='visit_review_action')return new Promise(resolve=>{finish=resolve;});
    return {data:fixture([row({nombre:args.p_restaurante_id})]),error:null};
  }};
  const renderer=await render(client);
  await act(async()=>renderer.root.findAllByType('a').find(node=>text(node).trim()==='Revisar reseña').props.onClick({preventDefault(){}}));
  await act(async()=>button(renderer,'Sí, ya la ha dejado').props.onClick());
  await act(async()=>renderer.update(React.createElement(Panel,{restauranteId:'restaurant-b',dark:false,client})));
  await act(async()=>finish({data:{ok:true},error:null}));
  assert.match(text(renderer.root.findByType('article')),/restaurant-b/);assert.doesNotMatch(text(renderer.toJSON()),/restaurant-a|Reseña confirmada\. Este cliente/);
  await act(async()=>renderer.unmount());
});
