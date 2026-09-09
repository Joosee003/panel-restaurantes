# WhatsApp de GastroHelp para varios restaurantes

Emisor común: **+34 643 41 61 57**, Meta phone number ID `1168690786323585`.
El perfil de WhatsApp es común; el texto identifica al restaurante.

## Reseñas

La marca «Ha venido» crea un evento con el `restaurante_id` de la reserva. La cola espera el plazo configurado y llama al webhook común de reseñas `gJEAvv5L445d69FS`.

El mensaje lleva el nombre del cliente, el del restaurante y un token cuyo enlace resuelve las reseñas de ese restaurante. Antes de enviar, el servidor vuelve a comprobar la visita, el permiso y si ya dejó una reseña en ese local. Una reseña confirmada en A no confirma la de B. La recepción de un clic en Google no confirma la publicación.

El emisor se comparte con el chatbot. El envío real sigue pendiente de validar la plantilla `gastrohelp_opinion_tras_visita` y activar los restaurantes preparados. Nunca dar por enviado un mensaje solo porque el webhook devolvió 200.

Prueba del panel recibida: ejecución n8n **69577**, 09/09/2026 16:03:01 UTC, evento terminado en `000924`, DEMOOOO, nombre Jose, modo test, sin envío de WhatsApp.

## Chatbot

Entrada Meta `WjZpYVB99OUxiYzi` → router `wEhIpYsLyJt8wmDf` → motor común `cScxTcKYJPtExDjn` → `/api/chatbot/inbox`.

Cada restaurante tiene su código en `whatsapp_restaurant_routes`. La activación exige también `restaurante_modulos.chatbot` y estado activo. Las rutas pilot solo se muestran a los teléfonos autorizados. No activar un local real sin completar sus datos y comprobar una reserva, cambio y cancelación de ese local.

Ejemplos de entrada al mismo número:

- La Reserva: `https://wa.me/34643416157?text=RESERVAR%20la-reserva-demo`
- DEMOOOO: `https://wa.me/34643416157?text=RESERVAR%20restaurante-demo`

Sin código se pregunta el restaurante. `CAMBIAR RESTAURANTE` borra la selección. El contexto caduca tras 30 minutos. Un código desconocido, una respuesta a un mensaje sin contexto identificable o una ruta desactivada no pueden usar el restaurante anterior.

La selección está guardada por número emisor y teléfono de cliente. El motor mantiene estado y reservas por restaurante y teléfono. Cada respuesta empieza con el nombre del local. Los mensajes se deduplican antes de seleccionar restaurante, incluso si el cliente ha cambiado de local; un bloqueo impide cambiarlo durante otro turno. Las tablas y funciones de selección solo son accesibles desde el servidor.

## Pruebas y mantenimiento

`node --test tests/shared-whatsapp.test.mjs` ejecuta la ruta real con SQL local y un motor sustituido: A → B, duplicados, bloqueos, caducidad, mensajes antiguos, autenticación, permisos y uso del mismo emisor en reseñas.

`mode: test` en el motor común comprueba selección y nombre sin llamar al motor de reservas ni enviar mensajes. Su contexto de selección es distinto del real. No equivale a una entrega de WhatsApp.

Generador del motor común: `node scripts/build-shared-chatbot-n8n.mjs`. La credencial Header Auth debe ser la existente **GastroHelp Chatbot Webhook**. El generador de reseñas conserva **GastroHelp · Entrada de reseñas**, una credencial distinta. No copiar ni rotar sus valores al configurar este recorrido.

Las tablas no almacenan texto ni copias de respuestas: solo estado e identificadores de mensajes. La limpieza existente del chatbot elimina deduplicación a los siete días y selecciones caducadas hace más de un día. El motor solo admite mensajes con antigüedad máxima de un día.

## Comprobación publicada del 9 de septiembre

- PR 44 fusionada; producción `0d29707e125c45ef3f45f61bea6a8b4b7cd59e4f`, despliegue `dpl_ES4GrvF76zMju7kvnLJetfKMYXnW` READY. CI 34376434142 correcto.
- Ejecución 69578: el motor común consulta la API publicada para La Reserva y DEMOOOO con el mismo teléfono sintético. Devuelve sus dos identificadores y nombres correctos, en modo test y sin modificar reservas.
- Ejecución 69581: recorrido completo por el router activo; subejecuciones 69582 y 69584. Ambas terminan sin enviar WhatsApp. Las pruebas sintéticas no acreditan recepción en un teléfono.
- Las dos demos tienen rutas pilot para el teléfono autorizado de Jose. DEMOOOO tiene habilitado el módulo chatbot para esa prueba. No se activó el chatbot para Hispanos Grill ni ningún local real.
- La entrada Meta conserva las respuestas citadas y ejecuta el router una vez por mensaje, también cuando Meta entrega varios juntos. La validación de firma se conserva.
- La consulta privada de opiniones exige igualdad del teléfono completo normalizado. Una coincidencia solo en los últimos dígitos no autoriza acceso. Si varios locales coinciden en el texto, se solicita una selección. La ausencia de configuración de reputación no detiene el chatbot.
- Las 14 pruebas de `shared-whatsapp.test.mjs` incluyen el contrato del router y el acceso por teléfono. Las credenciales de chatbot y reseñas siguen siendo distintas; ambas seleccionadas mediante las conexiones existentes.
