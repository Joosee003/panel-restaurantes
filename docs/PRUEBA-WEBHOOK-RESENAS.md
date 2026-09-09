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

Guardar la clave como variable sensible del servidor, sin prefijo `NEXT_PUBLIC_`, y desplegar de nuevo después de guardar las variables. La conexión disponible en esta sesión permite consultar Vercel y publicar código, pero no escribir estas variables. No se ha leído ni copiado la clave del webhook.

## Reserva para la prueba positiva

Crear una ficha de prueba independiente, sin reseña confirmada, con consentimiento de prueba y sin datos de clientes reales. El restaurante DEMOOOO debe continuar en `delivery_mode=test`. La reserva debe tener una hora anterior y cumplir el plazo configurado. El enlace de Google también debe estar configurado antes de programar una petición; el demo todavía no lo tiene.

No volver a usar la ficha confirmada de Jose ni quitar su confirmación para forzar la entrada. El nuevo ensayo debe mantener la separación entre apertura de Google y confirmación de la reseña.

## Resultado esperado

1. «Ha venido» registra asistencia y programa una sola petición elegible.
2. El despachador llama al webhook con `deliveryMode=test`, `suppressDelivery=true` y `whatsappAllowed=false`.
3. n8n devuelve el mismo identificador de evento, `outcome=test`, `send=false` y una vista previa del nombre, teléfono y restaurante.
4. El nodo WhatsApp no se ejecuta. El panel no registra un mensaje real, ni identificador `wamid`, ni fecha de envío.
5. Confirmar la reseña bloquea nuevas peticiones en futuras visitas.

La aprobación de plantilla y el emisor de WhatsApp se necesitan para una recepción real, pero no para este ensayo HTTP sin envío. Hasta completar la conexión de Vercel, una ejecución manual en n8n no acredita el recorrido desde el panel.

## Comprobación del 9 de septiembre

La ejecución manual 69571 de n8n terminó correctamente: devolvió `preview.firstName=Jose`, teléfono `447700900123`, restaurante `DEMOOOO` y `send=false`. El nodo WhatsApp no se ejecutó. Se publicó esa versión del flujo, 8783031a-723b-48c8-a591-0eb0ddd03b2a. El número de ensayo pertenece al [rango reservado por Ofcom para ficción](https://www.ofcom.org.uk/phones-and-broadband/phone-numbers/numbers-for-drama).

Las 24 pruebas de transporte y contrato, ESLint y TypeScript pasaron. La llamada HTTP desde el panel todavía depende de guardar las variables anteriores; esta ejecución manual no la sustituye.
