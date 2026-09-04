import {
  expr,
  ifElse,
  newCredential,
  node,
  trigger,
  workflow,
} from "@n8n/workflow-sdk";

const automationWebhook = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.1,
  config: {
    name: "Evento de automatización",
    position: [-520, 0],
    parameters: {
      httpMethod: "POST",
      path: "__WEBHOOK_PATH__",
      authentication: "headerAuth",
      responseMode: "lastNode",
      responseData: "firstEntryJson",
      options: {},
    },
    credentials: {
      httpHeaderAuth: newCredential("GastroHelp Automatizaciones Webhook"),
    },
  },
  output: [
    {
      headers: {
        "x-gastrohelp-automation-event": "automation.test:example",
        "x-gastrohelp-delivery-mode": "test",
      },
      body: {
        event: "automation.test",
        automationEventId: "automation.test:example",
        deliveryMode: "test",
        suppressDelivery: true,
      },
    },
  ],
});

const prepareNotifications = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Validar y preparar correos",
    position: [-260, 0],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: `const input = $input.first().json || {};
const headers = input.headers && typeof input.headers === 'object' ? input.headers : {};
const data = input.body && typeof input.body === 'object' ? input.body : input;
const customer = data.customer && typeof data.customer === 'object' ? data.customer : {};

const headerValue = (name) => String(headers[name] || headers[name.toLowerCase()] || '').trim();
const eventId = String(data.automationEventId || '').trim();
const headerEventId = headerValue('x-gastrohelp-automation-event');
const event = String(data.event || '').trim();
const deliveryMode = String(data.deliveryMode || '').trim();
const headerMode = headerValue('x-gastrohelp-delivery-mode');
const suppressDelivery = data.suppressDelivery === true;
const allowedEvents = new Set([
  'automation.test',
  'reservation.created',
  'reservation.rescheduled',
  'reservation.cancelled',
  'reservation.reminder',
  'reservation.status_changed',
  'visit.review_request',
  'loyalty.points_awarded',
]);
const eventIdPattern = /^[a-z][a-z0-9._:-]{2,239}$/i;

if (
  !allowedEvents.has(event)
  || !eventIdPattern.test(eventId)
  || eventId !== headerEventId
  || !['test', 'live'].includes(deliveryMode)
  || deliveryMode !== headerMode
) {
  throw new Error('INVALID_AUTOMATION_EVENT');
}

if (deliveryMode === 'test') {
  if (!suppressDelivery) throw new Error('INVALID_TEST_DELIVERY');
  return [{ json: { ok: true, accepted: true, sendEmail: false, eventId, event, deliveryMode } }];
}

if (suppressDelivery) throw new Error('INVALID_LIVE_DELIVERY');

const text = (value) => typeof value === 'string' ? value.trim() : '';
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const isEmail = (value) => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value);
const isTimestamp = (value) => /^\\d{4}-\\d{2}-\\d{2}T/.test(value) && !Number.isNaN(new Date(value).getTime());
const safeUrl = (value, prefix) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname === 'panel.gastrohelp.es' && parsed.pathname.startsWith(prefix);
  } catch {
    return false;
  }
};

const restaurantId = text(data.restaurantId);
const reservationId = text(data.reservationId);
const restaurantName = text(data.restaurantName);
const restaurantEmail = text(data.restaurantEmail);
const timezone = text(data.restaurantTimezone) || 'Europe/Madrid';
const customerName = text(customer.name) || 'Cliente';
const customerEmail = text(customer.email);
const start = text(data.start);
const previousStart = text(data.previousStart);
const managementUrl = text(data.managementUrl);
const reviewUrl = text(data.reviewUrl);
const party = Number(data.party || 0);

try {
  new Intl.DateTimeFormat('es-ES', { timeZone: timezone }).format();
} catch {
  throw new Error('INVALID_AUTOMATION_TIMEZONE');
}

if (
  !isUuid(restaurantId)
  || restaurantName.length < 2
  || restaurantName.length > 120
  || (restaurantEmail && !isEmail(restaurantEmail))
  || (customerEmail && !isEmail(customerEmail))
  || JSON.stringify(data).length > 20000
) {
  throw new Error('INVALID_AUTOMATION_PAYLOAD');
}

if (event.startsWith('reservation.') || event === 'visit.review_request') {
  const moment = event === 'reservation.cancelled' ? (previousStart || start) : start;
  if (!isUuid(reservationId) || !isTimestamp(moment) || !Number.isInteger(party) || party < 1 || party > 500) {
    throw new Error('INVALID_RESERVATION_EVENT');
  }
}

if (managementUrl && !safeUrl(managementUrl, '/reserva/')) {
  throw new Error('INVALID_MANAGEMENT_URL');
}
if (reviewUrl && !safeUrl(reviewUrl, '/opinion/')) {
  throw new Error('INVALID_REVIEW_URL');
}

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const formatMoment = (value) => new Intl.DateTimeFormat('es-ES', {
  timeZone: timezone,
  dateStyle: 'full',
  timeStyle: 'short',
}).format(new Date(value));
const shell = (title, message, details, action = '') =>
  '<div style="background:#f4f1e9;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">' +
  '<div style="max-width:600px;margin:auto;background:#ffffff;border-radius:24px;overflow:hidden">' +
  '<div style="background:#123c3a;padding:28px;color:white">' +
  '<div style="font-size:12px;letter-spacing:2px;color:#e7b75f;font-weight:700">GASTROHELP</div>' +
  '<h1 style="margin:10px 0 0;font-size:28px;color:white">' + escapeHtml(title) + '</h1></div>' +
  '<div style="padding:28px"><p style="line-height:1.6;color:#475569">' + escapeHtml(message) + '</p>' +
  details + action +
  '<p style="margin-top:28px;font-size:12px;color:#94a3b8">Mensaje automático de ' + escapeHtml(restaurantName) + '.</p>' +
  '</div></div></div>';

const labels = {
  'reservation.created': ['Reserva recibida', 'Hemos recibido tu reserva correctamente.'],
  'reservation.rescheduled': ['Reserva actualizada', 'Hemos guardado la nueva fecha de tu reserva.'],
  'reservation.cancelled': ['Reserva cancelada', 'La cancelación se ha realizado correctamente.'],
  'reservation.reminder': ['Recordatorio de reserva', 'Te recordamos que tienes una reserva próximamente.'],
  'reservation.status_changed': ['Estado de tu reserva actualizado', 'Tu reserva tiene un nuevo estado.'],
};
const notifications = [];
const canEmailCustomer = data.emailAllowed === true && isEmail(customerEmail);
const restaurantRecipient = isEmail(restaurantEmail) ? restaurantEmail : 'gastrohelpsmart@gmail.com';

if (event.startsWith('reservation.')) {
  const momentValue = event === 'reservation.cancelled' ? (previousStart || start) : start;
  const moment = formatMoment(momentValue);
  const details = '<div style="margin-top:20px;background:#f8fafc;border-radius:16px;padding:18px">' +
    '<p style="margin:0 0 8px"><strong>Fecha:</strong> ' + escapeHtml(moment) + '</p>' +
    '<p style="margin:0"><strong>Personas:</strong> ' + escapeHtml(party) + '</p></div>';
  const label = labels[event];
  if (canEmailCustomer) {
    const action = managementUrl
      ? '<p style="margin-top:22px"><a href="' + escapeHtml(managementUrl) + '" style="display:inline-block;background:#123c3a;color:white;text-decoration:none;padding:13px 18px;border-radius:12px;font-weight:700">Ver mi reserva</a></p>'
      : '';
    notifications.push({
      sendEmail: true,
      toEmail: customerEmail,
      subject: label[0] + ' · ' + restaurantName,
      html: shell(label[0], label[1], details, action),
    });
  }
  if (event !== 'reservation.reminder') {
    notifications.push({
      sendEmail: true,
      toEmail: restaurantRecipient,
      subject: label[0] + ' · ' + restaurantName,
      html: shell(label[0], 'El cambio ya está guardado en GastroHelp.', details),
    });
  }
}

if (event === 'visit.review_request' && canEmailCustomer && reviewUrl) {
  const action = '<p style="margin-top:22px"><a href="' + escapeHtml(reviewUrl) + '" style="display:inline-block;background:#123c3a;color:white;text-decoration:none;padding:13px 18px;border-radius:12px;font-weight:700">Dejar mi opinión</a></p>';
  notifications.push({
    sendEmail: true,
    toEmail: customerEmail,
    subject: '¿Qué tal fue tu visita? · ' + restaurantName,
    html: shell('Gracias por tu visita', 'Tu opinión nos ayuda a mejorar.', '', action),
  });
}

if (event === 'loyalty.points_awarded' && canEmailCustomer) {
  const points = Number(data.points || 0);
  if (!Number.isFinite(points) || points <= 0 || points > 1000000) throw new Error('INVALID_LOYALTY_EVENT');
  notifications.push({
    sendEmail: true,
    toEmail: customerEmail,
    subject: 'Tienes nuevos puntos · ' + restaurantName,
    html: shell('Puntos añadidos', 'Has recibido ' + points + ' puntos.', ''),
  });
}

if (!notifications.length) {
  return [{ json: { ok: true, accepted: true, sendEmail: false, eventId, event, deliveryMode, reason: 'no_email_notification' } }];
}

return notifications.map((notification) => ({ json: { ...notification, ok: true, accepted: true, eventId, event, deliveryMode } }));`,
    },
  },
  output: [
    {
      ok: true,
      accepted: true,
      sendEmail: false,
      eventId: "automation.test:example",
      event: "automation.test",
      deliveryMode: "test",
    },
  ],
});

const shouldSendEmail = ifElse({
  version: 2.3,
  config: {
    name: "¿Enviar correo?",
    position: [10, 0],
    parameters: {
      conditions: {
        combinator: "and",
        conditions: [
          {
            leftValue: expr("{{ $json.sendEmail === true }}"),
            operator: { type: "boolean", operation: "true", singleValue: true },
            rightValue: "true",
          },
        ],
        options: {
          caseSensitive: false,
          leftValue: "",
          typeValidation: "strict",
          version: 3,
        },
      },
      options: { ignoreCase: true },
    },
  },
});

const sendEmail = node({
  type: "n8n-nodes-base.emailSend",
  version: 2.1,
  config: {
    name: "Enviar correo",
    position: [280, -100],
    parameters: {
      operation: "send",
      fromEmail: "GastroHelp <gastrohelpsmart@gmail.com>",
      toEmail: expr("{{ $json.toEmail }}"),
      subject: expr("{{ $json.subject }}"),
      emailFormat: "html",
      html: expr("{{ $json.html }}"),
      options: { appendAttribution: false },
    },
    credentials: {
      smtp: newCredential("GastroHelp SMTP"),
    },
  },
});

const noDelivery = node({
  type: "n8n-nodes-base.noOp",
  version: 1,
  config: {
    name: "Confirmar prueba sin envío",
    position: [280, 100],
    parameters: {},
  },
});

export default workflow("gastrohelp-automation-email-v2", "Reservas nativas · Avisos v2")
  .add(automationWebhook)
  .to(prepareNotifications)
  .to(
    shouldSendEmail
      .onTrue(sendEmail)
      .onFalse(noDelivery),
  );
