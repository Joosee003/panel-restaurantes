# Comprobar la entrada de reseñas en n8n

La reserva «Jose · Prueba webhook» del 9 de septiembre sí guardó `atendida=true`. No creó una petición porque su cliente ya tiene `ya_dejo_resena=true`. Ese bloqueo debe mantenerse.

El modo `test` sigue siendo local por defecto. La lista `N8N_REVIEW_TEST_RESTAURANT_IDS` permite comprobar una llamada HTTP a n8n sin enviar WhatsApp. Es independiente de la lista de envíos reales.

## Conexión necesaria en Vercel

Proyecto `panel-restaurantes`, entorno Production:

| Variable | Valor |
| --- | --- |
| `N8N_REVIEW_WEBHOOK_URL` | `https://n8n.gastrohelp.es/webhook/gastrohelp-review-after-visit` |
| `N8N_REVIEW_WEBHOOK_SECRET` | Valor de Header Auth del webhook, cabecera `X-GastroHelp-Webhook-Secret` |
| `N8N_REVIEW_TEST_RESTAURANT_IDS` | `f13ff56d-45c1-484f-89de-b6888e3472d8` |

Las tres variables quedaron guardadas en Production el 9 de septiembre. La clave se creó para la credencial exclusiva `GastroHelp · Entrada de reseñas` y se guardó como Secret en Vercel, sin prefijo `NEXT_PUBLIC_` ni copias en el repositorio. La credencial antigua y la del chatbot conservan sus valores. El despliegue `dpl_F4JDnas1WVyorKWcagpDxTco3k7a`, commit `eea18f5c003126ff32b75e22dfc0a62fbff235d0`, terminó READY con el dominio `panel.gastrohelp.es`.

Para rotar la clave, actualizar esta credencial de n8n y `N8N_REVIEW_WEBHOOK_SECRET` en Vercel, publicar el flujo y volver a desplegar el panel. La versión publicada del flujo tras vincular la nueva credencial es `e4aaec0a-4a31-40b0-8fd6-a32b3b3ff53c`.

## Reserva para la prueba positiva

Usar una ficha de prueba independiente, sin reseña confirmada, con consentimiento de prueba y sin datos de clientes reales. El restaurante DEMOOOO debe continuar en `delivery_mode=test`. La reserva debe tener una hora anterior y cumplir el plazo configurado. El demo tiene `https://www.google.com/maps` como destino genérico para la prueba; el servicio real necesita el enlace de reseñas específico del restaurante.

No volver a usar la ficha confirmada de Jose ni quitar su confirmación para forzar la entrada. El nuevo ensayo debe mantener la separación entre apertura de Google y confirmación de la reseña.

## Resultado esperado

1. «Ha venido» registra asistencia y programa una sola petición elegible.
2. El despachador llama al webhook con `deliveryMode=test`, `suppressDelivery=true` y `whatsappAllowed=false`.
3. n8n devuelve el mismo identificador de evento, `outcome=test`, `send=false` y una vista previa del nombre, teléfono y restaurante.
4. El nodo WhatsApp no se ejecuta. El panel no registra un mensaje real, ni identificador `wamid`, ni fecha de envío.
5. Confirmar la reseña bloquea nuevas peticiones en futuras visitas.

La aprobación de plantilla y el emisor de WhatsApp se necesitan para una recepción real, pero no para este ensayo HTTP sin envío. Una ejecución manual en n8n no acredita el recorrido desde el panel: la evidencia debe incluir el evento de la reserva, la llamada HTTP de producción y su ejecución correlacionada en n8n.

## Comprobación del 9 de septiembre

La ejecución manual 69571 de n8n terminó correctamente: devolvió `preview.firstName=Jose`, teléfono `447700900123`, restaurante `DEMOOOO` y `send=false`. El nodo WhatsApp no se ejecutó. Se publicó esa versión del flujo, 8783031a-723b-48c8-a591-0eb0ddd03b2a. El número de ensayo pertenece al [rango reservado por Ofcom para ficción](https://www.ofcom.org.uk/phones-and-broadband/phone-numbers/numbers-for-drama).

Las 24 pruebas de transporte y contrato, ESLint y TypeScript pasaron. La ejecución manual anterior solo comprobó el contrato; la prueba de la conexión publicada se registra por separado.

## Conexión HTTP comprobada en producción

El 9 de septiembre a las 14:38:01 UTC, el despachador del panel llamó al webhook de producción. La ejecución [69573](https://n8n.gastrohelp.es/workflow/gJEAvv5L445d69FS/executions/69573) tiene modo `webhook`, estado `success` y el evento `visit.review_request:6fe7745b-9ebe-4c58-af52-a822d369f240`.

- Se marcó la asistencia con el RPC `marcar_asistencia_reserva` bajo el rol autenticado del restaurante; no mediante una pulsación del navegador en esta comprobación. La cola y el programador habituales realizaron después la llamada al panel y a n8n.
- n8n devolvió `preview.firstName=Jose`, `preview.phone=447700900123`, `preview.restaurantName=DEMOOOO`, `outcome=test` y `send=false`.
- El nodo WhatsApp no se ejecutó. El evento terminó `delivered` en un intento, con `test_no_message_sent`. La reserva conserva `resena_solicitada=false`; no se inventaron fecha de envío ni identificador de WhatsApp.
- Se preparó una segunda visita con petición programada. Confirmar la reseña con `visit_review_action(...,'confirm')` canceló esa petición y su evento con motivo `review_confirmed`, sin intentos de envío.
- Una tercera visita después de confirmar guardó la asistencia y no creó petición ni evento de reseña. La ficha original de Jose mantiene su reseña confirmada y sus permisos anteriores.

## Prueba que queda lista para Jose

En DEMOOOO, el 9 de septiembre a las 11:00 (Atlantic/Canary), está **Jose · Prueba lista**, reserva `76000000-0000-4000-8000-000000000924` y cliente ficticio `37488cbb-92a2-473e-9a29-8c94026fef1b`. Su teléfono es `+447700900124`, reservado para ficción. Tiene permiso de prueba, ninguna reseña confirmada, `atendida=null`, estado `confirmada` y ningún consumo. `null` significa asistencia sin marcar; `false` representa una ausencia y oculta el botón «Ha venido».

1. Recargar Reservas, elegir el día y localizar **Jose · Prueba lista**.
2. Pulsar **Ha venido**. La hora ya cumple el plazo de tres horas.
3. Abrir las ejecuciones del flujo de n8n; la cola se comprueba cada minuto y debe aparecer otra ejecución `webhook` con este identificador de reserva.

Se probó el RPC dos veces sobre esta ficha en una transacción revertida: creó una sola petición y un solo evento. La ficha queda sin asistencia y sin eventos para que Jose haga la pulsación. Como el restaurante sigue en test, la prueba no envía WhatsApp ni debe mostrarse como mensaje real enviado.

El servicio real sigue pendiente de la plantilla aprobada, el emisor, el enlace de reseñas propio del restaurante y una recepción autorizada. La lista `WHATSAPP_REVIEW_RESTAURANT_IDS` y la activación interna de n8n no se habilitaron para estas pruebas.
