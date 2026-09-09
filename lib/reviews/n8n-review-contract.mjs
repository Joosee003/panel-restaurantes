export function prepareReviewWebhook(input, settings) {
  const data = input?.body && typeof input.body === 'object' ? input.body : {};
  const headers = input?.headers || {};
  const id = typeof data.automationEventId === 'string' ? data.automationEventId : '';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const mode = data.deliveryMode;
  const blocked = (error) => ({ok:false,eventId:id,deliveryMode:mode,outcome:'blocked',error,send:false});
  if (data.event !== 'visit.review_request' || !uuid.test(id.replace(/^visit\.review_request:/, ''))
      || !id.startsWith('visit.review_request:') || id !== headers['x-gastrohelp-automation-event']
      || mode !== headers['x-gastrohelp-delivery-mode'] || !['live','test'].includes(mode)
      || !uuid.test(data.restaurantId || '') || JSON.stringify(data).length > 4096) {
    return blocked('review_event_invalid');
  }
  const testMode = mode === 'test';
  if (testMode && data.suppressDelivery !== true) return blocked('review_test_invalid');
  if (!testMode && (data.whatsappAllowed !== true || data.suppressDelivery === true)) return blocked('review_consent_missing');
  const hasReview = Object.prototype.hasOwnProperty.call(data, 'review');
  // A contact-free test remains available for checking the authenticated webhook.
  // A personalized test must validate the same contact fields as a live request.
  if (testMode && !hasReview) return {ok:true,eventId:id,deliveryMode:'test',outcome:'test',send:false};
  const review = data.review;
  const line = (value) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0,120) : '';
  if (!review || typeof review !== 'object' || Array.isArray(review)
      || typeof review.token !== 'string' || !uuid.test(review.token)
      || typeof review.phone !== 'string' || !/^[1-9][0-9]{7,14}$/.test(review.phone)
      || !line(review.name) || !line(review.restaurantName)) return blocked('review_contact_invalid');
  const preview = {firstName:line(review.name).split(' ')[0],phone:review.phone,restaurantName:line(review.restaurantName)};
  if (testMode) return {ok:true,eventId:id,deliveryMode:'test',outcome:'test',send:false,preview};
  if (settings.enabled !== true || settings.templateApproved !== true
      || !Array.isArray(settings.restaurantIds) || !settings.restaurantIds.includes(data.restaurantId)
      || !/^[0-9]+$/.test(settings.phoneNumberId || '')
      || !/^[a-z0-9_]+$/.test(settings.templateName || '')
      || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(settings.language || '')) return blocked('review_n8n_not_activated');
  return {send:true,eventId:id,deliveryMode:'live',...preview,token:review.token,
    phoneNumberId:settings.phoneNumberId,template:settings.templateName+'|'+settings.language};
}

export function reviewProviderReceipt(response, request) {
  const id = response?.messages?.[0]?.id;
  const status = response?.messages?.[0]?.message_status;
  const valid = typeof id === 'string' && id.length <= 512 && /^wamid\.[A-Za-z0-9._~+/=-]+$/.test(id)
    && (!status || status === 'accepted');
  return valid
    ? {ok:true,eventId:request.eventId,deliveryMode:'live',provider:'whatsapp',outcome:'sent',messageId:id}
    : {ok:false,eventId:request.eventId,deliveryMode:'live',outcome:'uncertain',error:'whatsapp_ack_missing'};
}
