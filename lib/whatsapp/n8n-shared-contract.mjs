export function prepareSharedMessage(ctx, phoneNumberId) {
  const message=ctx?.messages?.[0] || {};
  const contact=ctx?.contacts?.[0] || {};
  const from=String(message.from || contact.wa_id || '').replace(/[^0-9]/g,'');
  const test=ctx?.mode==='test' && ctx?.suppressDelivery===true;
  const input={
    phoneNumberId:String(ctx?.metadata?.phone_number_id || ''),
    messageId:String(message.id || ''),from,
    name:String(contact.profile?.name || 'Cliente WhatsApp').slice(0,120),
    text:String(message.text?.body || '').trim(),timestamp:String(message.timestamp || ''),
    replyToMessageId:String(message.context?.id || '').slice(0,512),mode:test?'test':'router',
  };
  const validMessage=ctx?.ignored!==true && ctx?.type!=='ignore' && input.phoneNumberId===phoneNumberId
    && /^[1-9][0-9]{6,14}$/.test(from) && input.messageId.length>0 && input.messageId.length<=190
    && input.text.length>0 && input.text.length<=2000 && /^[0-9]+$/.test(input.timestamp);
  return {...input,validMessage,suppressDelivery:test};
}

export function classifySharedResponse(envelope) {
  const status=Number(envelope?.statusCode ?? 200);
  const body=envelope?.body && typeof envelope.body==='object'?envelope.body:envelope;
  if(body?.duplicate===true || body?.suppressDelivery===true) return {route:'ignore',backend:body};
  if(status===409) return {route:'retry',error:'CHATBOT_BUSY'};
  if(status<200 || status>=300 || body?.ok!==true) return {route:'error',statusCode:status,error:String(body?.error||'CHATBOT_BACKEND_FAILED')};
  return {route:body.handoff===true?'handoff':'reply',reply:String(body.reply||''),restaurantId:body.restaurantId||null,action:body.action||null};
}

export function prepareSharedReply(result,input) {
  const recipient=input.from;
  const route=String(result?.route || 'error');
  if(input.suppressDelivery===true || input.mode==='test') return {deliver:false,recipient,textBody:'',route};
  const reply=String(result?.reply || '').trim();
  if(['reply','handoff'].includes(route)&&reply) return {deliver:true,recipient,textBody:reply,route};
  if(route==='retry') return {deliver:true,recipient,textBody:'Estoy terminando tu mensaje anterior. Espera un momento y vuelve a escribir.',route};
  if(route==='error') return {deliver:true,recipient,textBody:'No he podido procesarlo ahora. Vuelve a entrar desde el enlace del restaurante o escribe CAMBIAR RESTAURANTE.',route};
  return {deliver:false,recipient,textBody:'',route};
}
