# Chatbot WhatsApp v2

## Estado

- Flujo n8n: `N5YzUnM48EbwwS8a`
- Nombre: `Chatbot WhatsApp · Motor nativo v2 · PILOTO`
- Versión activa del motor: `f48711d0-d180-4d95-ad1c-5bdff7afb964`
- Router n8n: `wEhIpYsLyJt8wmDf`
- Versión activa del router: `c2f4c4fc-3db4-42ca-bacb-4313fe018238`
- Motor y router publicados: sí
- Entrega real por WhatsApp al remitente autorizado: comprobada
- Escrituras de reservas desde el piloto: bloqueadas mediante `mode: pilot`

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

La ruta está publicada y las llamadas autenticadas comprobadas devuelven `200`.

## Prueba segura

1. Ejecutar con `mode: test` y un identificador de mensaje nuevo.
2. Confirmar `ok: true`, `mode: test` y `suppressDelivery: true`.
3. Confirmar que no se creó, cambió ni canceló ninguna reserva.
4. Repetir el mismo identificador y confirmar que se marca como duplicado.
5. Si se prueba WhatsApp, mantener el filtro del remitente autorizado.

## Prueba por WhatsApp del piloto

El modo `pilot` entrega respuestas únicamente cuando el router ha limitado antes el remitente autorizado. Permite recorrer reservas, cancelaciones y cambios sin crear ni modificar una reserva real. El modo `live` sigue siendo el único que escribe cambios reales.

La prueba del piloto quedó completada con 21 turnos internos y una entrega real. Se comprobaron horarios, dirección, carta, alta simulada, validaciones, disponibilidad, cambio, cancelación, atención humana, reinicio y duplicados. La confirmación devolvió `test_only` y el recuento de reservas no cambió.

## Condiciones antes de activar `live`

- Restaurante real identificado.
- Titular, NIF/CIF, domicilio legal y email de privacidad cargados.
- Horarios, dirección, aforo y reglas de reserva revisados.
- Reserva real creada desde WhatsApp y comprobada en el panel.
- Cambio real comprobado en el panel.
- Cancelación real comprobada en el panel.
- Cero errores de ejecución durante la prueba.
- Copia de seguridad y restauración preparadas.
- Autorización de Jose justo antes de cambiar el modo a `live`.

## Pendiente de seguridad

- El flujo `Motor Reservas Supabase TEST` (`9VX4fCoRUhX7Ixvj`) quedó despublicado el 04/09/2026. Tenía un webhook temporal sin autenticación y ningún flujo activo dependía de él.
- El flujo antiguo `C9N9uXB5dFUh6xh4` está inactivo, no tiene versión activa y ningún flujo publicado lo referencia. Conserva 86 nodos y todavía no está archivado.
- Retirar el flujo antiguo `C9N9uXB5dFUh6xh4`.
- Rotar la credencial que usaba ese flujo.
- Confirmar primero que ningún flujo activo depende de ella.
- No guardar el valor de la credencial en GitHub, Notion ni este documento.
