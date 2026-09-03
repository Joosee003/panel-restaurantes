# Chatbot WhatsApp v2

## Estado

- Flujo n8n: `N5YzUnM48EbwwS8a`
- Nombre: `Chatbot WhatsApp · Motor nativo v2 · BORRADOR`
- Publicado: no
- Router publicado modificado: no
- Entrega real por WhatsApp: no

## Autenticación necesaria

La instalación actual de n8n bloquea el acceso de los nodos a variables de entorno. Esa protección debe mantenerse activa.

El nodo `Consultar motor GastroHelp` debe usar una credencial n8n de tipo `HTTP Header Auth` con estos datos:

- Nombre recomendado: `GastroHelp Chatbot Webhook`
- Cabecera: `X-GastroHelp-Webhook-Secret`
- Valor: exactamente el mismo valor de `N8N_CHATBOT_WEBHOOK_SECRET` guardado en Vercel

La API mantiene `N8N_NATIVE_BOOKING_WEBHOOK_SECRET` solo como respaldo temporal para instalaciones anteriores. Las nuevas credenciales del chatbot deben usar `N8N_CHATBOT_WEBHOOK_SECRET` para no compartir ni rotar claves de otros sistemas.

La clave no debe escribirse en el flujo, este archivo, GitHub, Notion ni una conversación.

## Dirección del servidor

El flujo usa esta dirección de producción:

`https://panel.gastrohelp.es/api/chatbot/messages`

No publicar ni conectar el flujo al router hasta que el código de la rama de prueba esté incorporado en producción y la llamada autenticada devuelva `200`.

## Prueba segura

1. Mantener el flujo apagado.
2. Asignar la credencial privada al nodo HTTP.
3. Ejecutar con `mode: test` y un identificador de mensaje nuevo.
4. Confirmar `ok: true`, `mode: test` y `suppressDelivery: true`.
5. Confirmar que no se creó, cambió ni canceló ninguna reserva.
6. Repetir el mismo identificador y confirmar que se marca como duplicado.
7. Solo después preparar una versión en borrador del router.

## Prueba por WhatsApp del piloto

El modo `pilot` entrega respuestas únicamente cuando el router ha limitado antes el remitente autorizado. Permite recorrer reservas, cancelaciones y cambios sin crear ni modificar una reserva real. El modo `live` sigue siendo el único que escribe cambios reales.

## Condiciones antes de publicar

- Prueba autenticada correcta.
- Cero errores de ejecución.
- Restaurante piloto identificado.
- Datos legales, horarios, dirección y reservas revisados.
- Número receptor de la prueba real confirmado en ese momento.
- Autorización explícita antes del primer WhatsApp real.
