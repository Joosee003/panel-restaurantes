# Solicitudes de reseña después de una visita

Cambio solicitado por Jose el 8 de septiembre de 2026 y publicado con su autorización en la [PR 40](https://github.com/Joosee003/panel-restaurantes/pull/40), rama `codex/post-visit-reviews`. El SQL se aplicó a producción el 9 de septiembre (versión remota 20260909075421) y la PR 40 se fusionó en main 45d24735. No se han enviado mensajes reales.

## Funcionamiento

- La reserva recoge un permiso de WhatsApp separado y opcional para pedir opiniones después de las visitas. No concede permisos de promociones. Las variantes de formato de un mismo teléfono reutilizan el cliente existente; no se fusionan registros históricos duplicados.
- El restaurante pulsa «Ha venido» en Reservas. Esa acción guarda `atendida=true`, sin cambiar el estado de la reserva, asignar mesa ni exigir un importe. Si falta el cliente, lo vincula dentro del restaurante sin conceder nuevos permisos comerciales. «Registrar consumo» sigue disponible después y no duplica registros.
- La petición solo se programa con asistencia registrada. El plazo es tres horas después de `inicio_at`, ajustable a dos; sin `inicio_at`, se usa la hora de la reserva con la zona horaria del restaurante. Crear o confirmar una reserva con `atendida=null` no solicita reseña. Una reserva pendiente marcada como visitada conserva su estado y sí puede solicitarla. Las canceladas y ausencias quedan excluidas.
- Una petición por reserva. Una visita posterior permite otra si el cliente sigue sin reseña confirmada y mantiene el permiso. Registrar una visita de hace más de un día no provoca un envío automático histórico.
- El restaurante ve automáticamente a quién se ha pedido una reseña y la fecha del envío. Su única acción es «Revisar en Google»: guarda «Sí, ya la ha dejado» o «Todavía no aparece». Los controles de envío manual se han retirado de esta pantalla. La configuración queda plegada.
- Cada petición tiene un enlace aleatorio `/r/[token]`. Cargarlo no cuenta como apertura de Google: se registra únicamente al pulsar el botón. No mide la llegada efectiva a Google, la publicación ni la valoración.
- El restaurante comprueba Google y marca «Sí, ya la ha dejado». Se guarda la confirmación del cliente y se cancelan sus peticiones pendientes. «Todavía no aparece» registra la revisión sin confirmar. «Corregir confirmación» permite peticiones en próximas visitas.
- La baja se ofrece en el enlace incluso si el restaurante elimina la URL de Google o deja de usar el módulo. A partir de la baja no se registran nuevas aperturas asociadas al permiso ni se envían nuevas peticiones.
- Se conservan la consulta de reseñas guardadas y la preparación de sus respuestas.

La solicitud pide una opinión honesta, sin seleccionar clientes según la valoración ni ofrecer incentivos. Véase la [política de contenido de Google Maps](https://support.google.com/contributionpolicy/answer/7400114?hl=en).

## Envío automático

Se usa la cola existente `reservation_webhook_deliveries`, con el identificador estable `visit.review_request:<reserva>`. Al cumplirse el plazo, el despachador comprueba de nuevo asistencia, permiso y confirmación, y manda el evento al flujo de n8n «Reseñas · Ha venido → WhatsApp». n8n envía la plantilla mediante su nodo WhatsApp Business Cloud y devuelve el identificador aceptado por WhatsApp. El servidor guarda el resultado en el panel. Las notificaciones de reservas y fidelización conservan su transporte actual.

El flujo está [publicado en n8n](https://n8n.gastrohelp.es/workflow/gJEAvv5L445d69FS), con la activación interna de envíos reales deshabilitada. Su código se genera con `node scripts/build-review-n8n.mjs`. Las funciones de validación y acuse de `lib/reviews/n8n-review-contract.mjs` se incluyen en los nodos y se prueban junto al transporte. El 9 de septiembre la ejecución HTTP 69573 confirmó la entrada desde el panel con nombre y teléfono correctos, sin ejecutar WhatsApp. Evidencias y reserva preparada en [PRUEBA-WEBHOOK-RESENAS.md](PRUEBA-WEBHOOK-RESENAS.md).

El envío exige:

1. Módulos de reseñas y automatizaciones activos; configuración habilitada, modo `live`, WhatsApp y petición de reseña habilitados.
2. Cliente marcado como «Ha venido», plazo cumplido, permiso vigente, cliente sin reseña confirmada y enlace de Google válido. Una ausencia o cancelación registrada antes del envío lo impide.
3. Configuración de servidor y activación expresa para el restaurante:

| Variable | Contenido |
| --- | --- |
| `N8N_REVIEW_WEBHOOK_URL` | Webhook de producción del flujo de reseñas: `https://n8n.gastrohelp.es/webhook/gastrohelp-review-after-visit` |
| `N8N_REVIEW_WEBHOOK_SECRET` | Valor de la credencial Header Auth de ese flujo, cabecera `X-GastroHelp-Webhook-Secret` |
| `WHATSAPP_REVIEW_RESTAURANT_IDS` | UUID de restaurantes autorizados para WhatsApp real, separados por comas; vacío impide envíos |
| `N8N_REVIEW_TEST_RESTAURANT_IDS` | UUID de restaurantes autorizados para probar HTTP con n8n sin WhatsApp; vacío mantiene la prueba local |

Estas variables no llevan prefijo `NEXT_PUBLIC_`. El token de Meta queda en la credencial WhatsApp de n8n. En «Validar visita y activación» se configuran el emisor, nombre e idioma de la plantilla aprobada y restaurantes autorizados; `enabled` y `templateApproved` permanecen en falso hasta la validación. El webhook usa ahora la credencial exclusiva `GastroHelp · Entrada de reseñas`, con la misma clave guardada como Secret en Vercel; las credenciales anteriores conservan sus valores. La pantalla comprueba la configuración sin exponer credenciales. La configuración por sí sola no acredita un envío real.

La plantilla necesita dos parámetros de cuerpo (primer nombre y restaurante) y un botón URL con `https://panel.gastrohelp.es/r/{{1}}`. El parámetro del botón es únicamente el UUID aleatorio de la petición. Texto propuesto para someter a aprobación:

> Hola {{1}}, gracias por tu visita a {{2}}. ¿Nos cuentas tu experiencia en Google? Tu opinión nos ayuda a mejorar. Desde el enlace también puedes dejar de recibir estas peticiones.

Botón: «Compartir mi opinión». Consultar los [componentes de plantillas de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components/) y la [API de mensajes](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api).

Solo un acuse de n8n con el mismo evento, modo `live`, proveedor `whatsapp`, resultado `sent` e identificador `wamid` registra aceptación. Un HTTP 200 genérico no cuenta como envío. No se afirma entrega al teléfono ni lectura. Por defecto el modo de prueba del servidor no llama a n8n. Con N8N_REVIEW_TEST_RESTAURANT_IDS, URL y secreto configurados, envía un POST test con suppressDelivery=true y whatsappAllowed=false; exige un acuse test correlacionado y la vista previa del mismo nombre, teléfono y restaurante. Nunca registra ese acuse como envío real. El modo de prueba de n8n no llega al nodo WhatsApp. La conexión se documenta en PRUEBA-WEBHOOK-RESENAS.md. Un timeout, error de servidor o respuesta sin identificador queda pendiente de revisión por GastroHelp; no se reintenta automáticamente. El nodo WhatsApp tampoco tiene reintentos activados. Si falla el guardado de la aceptación, el token de envío impide repetir el mensaje. Un mensaje ya en tránsito no puede retirarse al confirmar una reseña o una baja.

## Aplicación y reversión

1. Revisar los controles de CI y una vista previa con una base aislada. La migración `supabase/migrations/20260908164431_post_visit_review_requests.sql` está creada con Supabase CLI y contiene el SQL comprobado, incluido el RPC de asistencia. Aplicarla una sola vez al completar la revisión. Comprobar que la función actual de notificaciones conserva la misma definición que la usada como base en este cambio.
2. Guardar una copia reciente y la definición anterior de `sync_reservation_automation_events`. Aplicar el SQL atómico antes del despliegue de la aplicación, que necesita los nuevos RPC. El script no hace backfill ni envía mensajes históricos. No requiere cambiar el plan de Supabase.
3. Comprobar el recorrido con una identidad de prueba autorizada: confirmar una reserva no debe programar la petición; pulsar «Ha venido» debe programarla sin cambiar estado, mesa o gasto. Validar con Supabase Auth/PostgREST y comprobar que el consumo se puede registrar después.
4. Configurar la plantilla aprobada y el emisor en n8n, comprobar Header Auth y la lista de restaurantes de n8n/servidor, publicar el flujo y probar con un destino autorizado. Verificar aceptación y baja antes de usar clientes reales. La plantilla aún no está aprobada ni se han enviado mensajes reales.
5. Si hace falta parar: desactivar «Pedir automáticamente» y retirar el restaurante de la lista del servidor. Esto cancela la cola pendiente y conserva el seguimiento y la auditoría. Para volver al código anterior, restaurar la función anterior después de detener reseñas; conservar la tabla y sus registros, sin borrado destructivo.

El cierre técnico registrado en Notion exige revisar una vista previa antes de producción y no activar mensajes reales sin una prueba autorizada con restaurante y plantillas Meta. Este cambio permanece en revisión hasta cumplir esos pasos.

## Pruebas

```sh
npm ci
npm ci --prefix tests/sql
node --test tests/review-flow.test.mjs tests/n8n-review-contract.test.mjs
node scripts/test-review-schema.mjs
node scripts/test-review-concurrent.mjs
node scripts/test-review-http.mjs
npm run lint
npm run build
```

La copia de catálogo es la misma fixture saneada de la revisión de servicios: 50 tablas públicas, 5 vistas, 102 funciones, 60 triggers y 242 políticas. No contiene filas de clientes ni credenciales. Se reutiliza el restaurador de esa revisión para probar las funciones con los permisos y triggers de la aplicación.

El [CI 34330513405](https://github.com/Joosee003/panel-restaurantes/actions/runs/34330513405) de la PR 41 superó 24 pruebas de transporte/contrato n8n, 24 recorridos SQL, 6 de concurrencia PostgreSQL y 5 HTTP, junto con lint, auditoría y compilación. Después se comprobó la llamada del panel desplegado al webhook de n8n y la cancelación y bloqueo de peticiones al confirmar una reseña.

El [control de CI del código publicado](https://github.com/Joosee003/panel-restaurantes/actions/runs/34249261320), commit `112f04939182d9113f98044a1e76763bf59cbdc6`, terminó correctamente: 10 pruebas de mensaje/transporte, 17 recorridos SQL, 6 carreras entre conexiones independientes con PostgreSQL 17, 5 comprobaciones por HTTP, lint, auditoría de dependencias de producción y compilación estándar. Vercel también completó la compilación de la vista previa de ese commit.

La prueba HTTP de CI usa páginas y rutas reales con transporte RPC local sobre PGlite; no sustituye Supabase Auth/PostgREST ni una recepción real. La revisión visual de escritorio, diálogo de confirmación y móvil de 390 píxeles ya se completó. La asistencia se verificó con rol autenticado, y la conexión de producción con el evento de la reserva y la ejecución n8n 69573. El ensayo HTTP no acredita recepción de WhatsApp.

## Aclaración de Jose: asistencia y n8n

Jose precisó que quería recuperar «Ha venido» como señal para la automatización de n8n. La interpretación anterior que programaba desde «Confirmar reserva» se ha retirado. La reserva pública conserva el permiso opcional en la misma transacción, pero no programa peticiones hasta registrar asistencia.

La revisión del historial confirmó el antiguo POST del panel a `/webhook/resena-email`. La implementación activa lo había sustituido por trigger de asistencia, cola y «Reservas nativas · Avisos», que actualmente prepara correos. No se reactiva esa entrada antigua. El nuevo flujo de reseñas usa autenticación, plantilla WhatsApp y acuse verificable, conservando el envío desde la asistencia.

El programador existente de Supabase `gastrohelp-automation-dispatch` está activo cada minuto. Llama a `trigger_automation_panel_dispatch`, que apunta a `/api/automations/dispatch` y usa un nonce. No se ha cambiado este programador. La migración, el despliegue y la conexión del webhook por variables de Vercel se completaron el 9 de septiembre. La ejecución 69573 recibió el evento programado por esta cola. Continúan pendientes la configuración de WhatsApp real y la recepción autorizada.

## Vista preparada para Jose

La vista previa de la rama genera `/pruebas-resenas/index.html` y `/pruebas-resenas/mobile.html`. La compilación de producción elimina estos archivos. Se usan los mismos componentes, SQL y transporte con una respuesta de n8n/WhatsApp simulada. La base PGlite contiene únicamente datos ficticios, sin credenciales ni llamadas a Supabase, n8n o Meta.

Al abrir se crea una reserva ficticia, se marca «Ha venido» usando el mismo RPC y se simula el envío con el plazo cumplido. Esta preparación automática solo pertenece al ensayo: en el restaurante la asistencia se marca en Reservas. El apartado de reseñas muestra el envío y «Revisar en Google». «Ver mensaje del cliente» muestra el texto de la petición.

1. Pulsar «Revisar en Google» y guardar si el cliente ha dejado su reseña.
2. En «Opciones de esta prueba», simular otra visita: si sigue sin confirmar se enviará otra petición; si está confirmada, no se enviará.
3. Las opciones plegadas también permiten comprobar duplicados, simular una baja o reiniciar. Cada pestaña mantiene su propia prueba y recargar comienza de nuevo.

La revisión visual y las pruebas locales no sustituyen la comprobación con Supabase Auth/PostgREST ni la recepción real en WhatsApp. Están publicados el transporte, el flujo de n8n y la migración; la configuración de envíos reales sigue deshabilitada. La propuesta está en `docs/whatsapp-review-template.json`. La plantilla es una propuesta, no una aprobación de Meta. Falta completar la activación y comprobar la recepción con un destino autorizado.
