import {prepareReviewWebhook,reviewProviderReceipt} from '../lib/reviews/n8n-review-contract.mjs';

const settings={enabled:false,templateApproved:false,restaurantIds:[],phoneNumberId:'',templateName:'gastrohelp_opinion_tras_visita',language:'es'};
const prepareCode=prepareReviewWebhook.toString()+'\nconst settings='+JSON.stringify(settings)+';\nreturn [{json:prepareReviewWebhook($input.first().json,settings)}];';
const receiptCode=reviewProviderReceipt.toString()+"\nreturn [{json:reviewProviderReceipt($input.first().json,$('Validar visita y activación').item.json)}];";
const code=`import {workflow,node,trigger,ifElse,sticky,newCredential,expr} from '@n8n/workflow-sdk';
const start=trigger({type:'n8n-nodes-base.webhook',version:2.1,config:{name:'Petición después de Ha venido',position:[0,0],parameters:{httpMethod:'POST',path:'gastrohelp-review-after-visit',authentication:'headerAuth',responseMode:'responseNode',options:{}},credentials:{httpHeaderAuth:newCredential('GastroHelp · Entrada de reseñas')}},output:[{body:{event:'visit.review_request'},headers:{}}]});
const prepare=node({type:'n8n-nodes-base.code',version:2,config:{name:'Validar visita y activación',position:[280,0],parameters:{mode:'runOnceForAllItems',language:'javaScript',jsCode:${JSON.stringify(prepareCode)}}},output:[{send:false,eventId:'visit.review_request:76000000-0000-4000-8000-000000000001',deliveryMode:'live',outcome:'blocked'}]});
const enabled=ifElse({version:2.3,config:{name:'¿Envío autorizado?',position:[560,0],parameters:{conditions:{combinator:'and',options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:3},conditions:[{leftValue:expr('{{ $json.send === true && $json.deliveryMode === \"live\" ? \"SEND\" : \"STOP\" }}'),operator:{type:'string',operation:'equals'},rightValue:'SEND'}]}}},output:[{send:false}]});
const send=node({
  type:'n8n-nodes-base.whatsApp',version:1.1,
  config:{
    name:'Enviar plantilla de WhatsApp',position:[840,-120],retryOnFail:false,
    credentials:{whatsAppApi:newCredential('WhatsApp GastroHelp')},
    parameters:{
      resource:'message',operation:'sendTemplate',
      phoneNumberId:expr('{{ $json.phoneNumberId }}'),recipientPhoneNumber:expr('{{ $json.phone }}'),template:expr('{{ $json.template }}'),
      components:{component:[
        {type:'body',bodyParameters:{parameter:[
          {type:'text',text:expr('{{ $json.firstName }}')},
          {type:'text',text:expr('{{ $json.restaurantName }}')}
        ]}},
        {type:'button',sub_type:'url',index:0,buttonParameters:{parameter:{type:'text',text:expr('{{ $json.token }}')}}}
      ]}
    }
  },
  output:[{messaging_product:'whatsapp',messages:[{id:'wamid.fixture'}]}]
});
const receipt=node({type:'n8n-nodes-base.code',version:2,config:{name:'Comprobar aceptación de WhatsApp',position:[1120,-120],parameters:{mode:'runOnceForAllItems',language:'javaScript',jsCode:${JSON.stringify(receiptCode)}}},output:[{ok:true,eventId:'visit.review_request:76000000-0000-4000-8000-000000000001',deliveryMode:'live',provider:'whatsapp',outcome:'sent',messageId:'wamid.fixture'}]});
const respond=node({type:'n8n-nodes-base.respondToWebhook',version:1.5,config:{name:'Guardar resultado en el panel',position:[1400,0],parameters:{respondWith:'json',responseBody:expr('{{ $json }}'),options:{responseCode:200,responseHeaders:{entries:[{name:'Cache-Control',value:'no-store'}]}}}},output:[{ok:false,outcome:'blocked'}]});
const note=sticky('## Ha venido → WhatsApp\\nLa visita se registra en Reservas. La cola espera hasta las 2 o 3 horas de la hora reservada; al cumplirse el plazo llama aquí. Este flujo envía la petición y devuelve el identificador de WhatsApp al panel.\\n\\nPreparado, SIN ACTIVAR. En «Validar visita y activación» deben configurarse el emisor, los restaurantes autorizados y la plantilla aprobada antes de poner enabled y templateApproved a true. Seleccionar credenciales correctas de WhatsApp y Header Auth (X-GastroHelp-Webhook-Secret).\\n\\nNo reejecutar envíos dudosos: comprobar antes si WhatsApp los aceptó. No añadir reintentos al nodo de envío. Un clic en Google no confirma la reseña.',[prepare,send],{color:5});
export default workflow('gastrohelp-review-after-visit','Reseñas · Ha venido → WhatsApp').add(start).to(prepare).to(enabled.onTrue(send.to(receipt.to(respond))).onFalse(respond)).add(note);
`;
process.stdout.write(code);
