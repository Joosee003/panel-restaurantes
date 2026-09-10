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

Los enlaces con texto preparado siguen siendo opcionales:

- La Reserva: `https://wa.me/34643416157?text=RESERVAR%20la-reserva-demo`
- DEMOOOO: `https://wa.me/34643416157?text=RESERVAR%20restaurante-demo`

El cliente puede escribir normalmente. Si falta el local, se pregunta su nombre, sin códigos. Se reconoce el nombre completo dentro de una frase, y la parte anterior a «·» en los nombres de demostración. Los nombres se comparan por palabras completas, sin tildes ni diferencias entre mayúsculas y minúsculas. Si coinciden varios locales o se menciona uno desconocido, se pide concretar; no se elige por aproximación.

«Cambiar de restaurante» abre una nueva selección. El contexto activo caduca tras 30 minutos sin actividad o al cambiar el día en España. Durante los siguientes siete días se puede proponer el último restaurante, pero se exige una respuesta antes de seleccionarlo. Un «sí» solo confirma el local y empieza un proceso nuevo: nunca confirma ni recupera una reserva pendiente anterior. Si rechaza la propuesta, se solicita otro nombre.

Mientras se pregunta el nombre se conserva únicamente la intención (reserva, cambio, cancelación, carta, horario, dirección o atención personal). Las preguntas posteriores recogen los datos de la reserva. Una respuesta citada sin contexto identificable o una ruta desactivada no pueden usar automáticamente el restaurante anterior.

La selección está guardada por número emisor y teléfono de cliente. El motor mantiene estado y reservas por restaurante y teléfono. Cada respuesta empieza con el nombre del local. Los mensajes se deduplican antes de seleccionar restaurante, incluso si el cliente ha cambiado de local; un bloqueo impide cambiarlo durante otro turno. Las tablas y funciones de selección solo son accesibles desde el servidor.

## Pruebas y mantenimiento

`node --test tests/shared-whatsapp.test.mjs` ejecuta la ruta real con SQL local y un motor sustituido: A → B, duplicados, bloqueos, caducidad, mensajes antiguos, autenticación, permisos y uso del mismo emisor en reseñas.

`mode: test` en el motor común comprueba selección y nombre sin llamar al motor de reservas ni enviar mensajes. Su contexto de selección es distinto del real. No equivale a una entrega de WhatsApp.

Generador del motor común: `node scripts/build-shared-chatbot-n8n.mjs`. La credencial Header Auth debe ser la existente **GastroHelp Chatbot Webhook**. El generador de reseñas conserva **GastroHelp · Entrada de reseñas**, una credencial distinta. No copiar ni rotar sus valores al configurar este recorrido.

Las tablas de selección no almacenan el texto del cliente ni copias de respuestas: solo estado, identificadores y una intención de una lista cerrada. La limpieza existente elimina deduplicación a los siete días y contactos caducados hace más de siete días; borra la sugerencia y la intención al caducar el contexto. El motor solo admite mensajes con antigüedad máxima de un día.

## Comprobación publicada del 9 de septiembre

- PR 44 fusionada; producción `0d29707e125c45ef3f45f61bea6a8b4b7cd59e4f`, despliegue `dpl_ES4GrvF76zMju7kvnLJetfKMYXnW` READY. CI 34376434142 correcto.
- Ejecución 69578: el motor común consulta la API publicada para La Reserva y DEMOOOO con el mismo teléfono sintético. Devuelve sus dos identificadores y nombres correctos, en modo test y sin modificar reservas.
- Ejecución 69581: recorrido completo por el router activo; subejecuciones 69582 y 69584. Ambas terminan sin enviar WhatsApp. Las pruebas sintéticas no acreditan recepción en un teléfono.
- Las dos demos tienen rutas pilot para el teléfono autorizado de Jose. DEMOOOO tiene habilitado el módulo chatbot para esa prueba. No se activó el chatbot para Hispanos Grill ni ningún local real.
- La entrada Meta conserva las respuestas citadas y ejecuta el router una vez por mensaje, también cuando Meta entrega varios juntos. La validación de firma se conserva.
- La consulta privada de opiniones exige igualdad del teléfono completo normalizado. Una coincidencia solo en los últimos dígitos no autoriza acceso. Si varios locales coinciden en el texto, se solicita una selección. La ausencia de configuración de reputación no detiene el chatbot.
- Las 14 pruebas de `shared-whatsapp.test.mjs` incluyen el contrato del router y el acceso por teléfono. Las credenciales de chatbot y reseñas siguen siendo distintas; ambas seleccionadas mediante las conexiones existentes.


## Conversación sin códigos — 10 de septiembre

La API común decide el local antes de llamar al motor. `startNewConversation` descarta el borrador antiguo al seleccionar o confirmar un restaurante. El motor procesa la intención desde el estado inicial; los turnos siguientes mantienen el estado del restaurante seleccionado. No cambia la configuración pilot/live ni el emisor.

Migración `20260910160709_natural_whatsapp_restaurant_selection.sql`: añade el recuerdo del último local, la sugerencia pendiente y una intención limitada. La función de cierre nueva conserva la validación y el bloqueo originales; solo `service_role` puede utilizarla. La firma de cierre anterior sigue disponible durante el despliegue.

23 pruebas con la API, SQL local y el motor real cubren mensajes normales, nombre dentro de una frase, selección ambigua, vuelta otro día, confirmación del local, negativa, cambio de local, desactivación, duplicados y aislamiento. Se comprueba que «cancelar la reserva» no se interprete como el restaurante «La Reserva».


Publicación PR 46: producción `1791ecc37116dbdaa7f30f8f9f9cd3275ddfabd1`, CI 34500275132 correcto. Ejecuciones n8n 69649 y 69657: siete turnos cada una por el motor publicado, sin envío de mensajes; entrada normal, nombre del local, personas, cambio entre las dos demos y vuelta con confirmación. Cada sesión conserva el restaurante correcto.

El número común usa el nombre del local registrado en el panel tanto en la selección como en la respuesta. El chatbot propio de la web conserva su nombre público. Esto evita que un demo presente dos nombres distintos en el mismo mensaje.


## Saludo y nombre de la demo — corrección del 10 de septiembre

Un saludo pregunta con qué restaurante quiere hablar el cliente y qué necesita. Elegir el local o confirmar el último abre el asistente sin iniciar una reserva. Si el mensaje anterior ya pedía carta, horario o reserva, se conserva esa intención. Un nuevo saludo descarta la intención pendiente anterior.

Los nombres admiten diferencias de mayúsculas, tildes, puntuación y letras repetidas. «demo» identifica DEMOOOO por el nombre completo normalizado; no selecciona La Reserva solo por contener la palabra Demo dentro de su nombre. Si dos locales tienen el mismo nombre tras normalizarlo, se pide aclaración.

El asistente pregunta en qué puede ayudar y atiende carta, horarios, ubicación, reservas y atención personal. Solo inicia el proceso de reserva cuando el cliente lo pide. Volver a saludar deja atrás un borrador incompleto; una conversación transferida al equipo sigue bajo su atención.

Validación: 27 pruebas locales de API, SQL y motor, incluida la secuencia de la captura de Jose, las variantes del nombre, el saludo al volver, carta antes de reservar y nombres coincidentes.
