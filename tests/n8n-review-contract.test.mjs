import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareReviewWebhook,reviewProviderReceipt} from '../lib/reviews/n8n-review-contract.mjs';

const restaurant='72000000-0000-4000-8000-000000000001';
const id='visit.review_request:76000000-0000-4000-8000-000000000001';
const input={headers:{'x-gastrohelp-automation-event':id,'x-gastrohelp-delivery-mode':'live'},body:{event:'visit.review_request',automationEventId:id,restaurantId:restaurant,deliveryMode:'live',whatsappAllowed:true,review:{token:'77000000-0000-4000-8000-000000000001',phone:'34600000001',name:'Cliente Prueba',restaurantName:'Restaurante de prueba'}}};
const settings={enabled:true,templateApproved:true,restaurantIds:[restaurant],phoneNumberId:'123456',templateName:'review_fixture',language:'es'};
test('n8n prepares a template only for matching event, permission and activated restaurant',()=>{
 const result=prepareReviewWebhook(input,settings);
 assert.equal(result.send,true);assert.equal(result.template,'review_fixture|es');assert.equal(result.firstName,'Cliente');assert.equal(result.token,input.body.review.token);
 for(const change of [{enabled:false},{templateApproved:false},{restaurantIds:[]},{phoneNumberId:''}])assert.equal(prepareReviewWebhook(input,{...settings,...change}).send,false);
});
test('n8n blocks wrong events, missing consent and invalid destinations before WhatsApp',()=>{
 for(const change of [{event:'reservation.created'},{automationEventId:'visit.review_request:bad'},{whatsappAllowed:false},{restaurantId:'another'},{review:{...input.body.review,phone:'https://evil.invalid'}},{review:{...input.body.review,token:'../another'}}]){
  assert.equal(prepareReviewWebhook({...input,body:{...input.body,...change}},settings).send,false);
 }
 assert.equal(prepareReviewWebhook({...input,headers:{...input.headers,'x-gastrohelp-automation-event':'different'}},settings).send,false);
});
test('n8n test mode never reaches WhatsApp, even with active settings',()=>{
 const testInput={headers:{...input.headers,'x-gastrohelp-delivery-mode':'test'},body:{...input.body,deliveryMode:'test',suppressDelivery:true}};
 assert.deepEqual(prepareReviewWebhook(testInput,settings),{ok:true,eventId:id,deliveryMode:'test',outcome:'test',send:false});
 assert.equal(prepareReviewWebhook({...testInput,body:{...testInput.body,suppressDelivery:false}},settings).send,false);
});
test('n8n returns provider acceptance only for a genuine message identifier and accepted status',()=>{
 const request={eventId:id};
 assert.deepEqual(reviewProviderReceipt({messages:[{id:'wamid.fixture',message_status:'accepted'}]},request),{ok:true,eventId:id,deliveryMode:'live',provider:'whatsapp',outcome:'sent',messageId:'wamid.fixture'});
 for(const response of [{ok:true},{messages:[{id:'not-a-provider-id'}]},{messages:[{id:'wamid.fixture',message_status:'held_for_quality_assessment'}]}]) assert.equal(reviewProviderReceipt(response,request).outcome,'uncertain');
});
