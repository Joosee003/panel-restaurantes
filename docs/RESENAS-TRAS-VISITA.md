# Solicitudes de reseña después de una visita

Cambio solicitado por Jose el 8 de septiembre de 2026 y publicado con su autorización en la [PR 40](https://github.com/Joosee003/panel-restaurantes/pull/40), rama `codex/post-visit-reviews`. No se ha aplicado el SQL a producción ni se han enviado mensajes reales.

## Funcionamiento

- La reserva recoge un permiso de WhatsApp separado y opcional para pedir opiniones después de las visitas. No concede permisos de promociones. Las variantes de formato de un mismo teléfono reutilizan el cliente existente; no se fusionan registros históricos duplicados.
- La petición se programa tres horas después de `inicio_at`, ajustable a dos. Sin `inicio_at`, se usa la hora de la reserva con la zona horaria del restaurante. Se programa desde una reserva confirmada, sin que el restaurante marque la asistencia. Se excluyen reservas pendientes, canceladas y ausencias, incluido `atendida=false`; `atendida=null` permite el envío al llegar la hora.
- Una petición por reserva. Una visita posterior permite otra si el cliente sigue sin reseña confirmada y mantiene el permiso. Registrar una visita de hace más de un día no provoca un envío automático histórico.
- El restaurante ve automáticamente a quién se ha pedido una reseña y la fecha del envío. Su única acción es «Revisar en Google»: guarda «Sí, ya la ha dejado» o «Todavía no aparece». Los controles de envío manual se han retirado de esta pantalla. La configuración queda plegada.
- Cada petición tiene un enlace aleatorio `/r/[token]`. Cargarlo no cuenta como apertura de Google: se registra únicamente al pulsar el botón. No mide la llegada efectiva a Google, la publicación ni la valoración.
- El restaurante comprueba Google y marca «Sí, ya la ha dejado». Se guarda la confirmación del cliente y se cancelan sus peticiones pendientes. «Todavía no aparece» registra la revisión sin confirmar. «Corregir confirmación» permite peticiones en próximas visitas.
- La baja se ofrece en el enlace incluso si el restaurante elimina la URL de Google o deja de usar el módulo. A partir de la baja no se registran nuevas aperturas asociadas al permiso ni se envían nuevas peticiones.
- Se conservan la consulta de reseñas guardadas y la preparación de sus respuestas.

La solicitud pide una opinión honesta, sin seleccionar clientes según la valoración ni ofrecer incentivos. Véase la [política de contenido de Google Maps](https://support.google.com/contributionpolicy/answer/7400114?hl=en).

## Envío automático

Se usa la cola existente `reservation_webhook_deliveries`, con el identificador estable `visit.review_request:<reserva>`. Las notificaciones de reservas y fidelización conservan su transporte actual. El nuevo evento de reseña se entrega por la API oficial de WhatsApp, con plantilla; no pasa por el webhook genérico que podría dar un HTTP 200 sin haber enviado un mensaje.

El envío exige:

1. Módulos de reseñas y automatizaciones activos; configuración habilitada, modo `live`, WhatsApp y petición de reseña habilitados.
2. Reserva confirmada, plazo cumplido, permiso vigente, cliente sin reseña confirmada y enlace de Google válido. No exige marcar la visita. Una ausencia o cancelación registrada antes del envío lo impide.
3. Configuración de servidor y activación expresa para el restaurante:

| Variable | Contenido |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Credencial de servidor del número autorizado |
| `WHATSAPP_PHONE_NUMBER_ID` | Identificador del número emisor |
| `WHATSAPP_GRAPH_VERSION` | Versión soportada validada al configurar Meta, con formato `vNN.N` |
| `WHATSAPP_REVIEW_TEMPLATE_NAME` | Nombre exacto de la plantilla aprobada |
| `WHATSAPP_REVIEW_TEMPLATE_LANGUAGE` | Idioma exacto aprobado, por ejemplo `es` |
| `WHATSAPP_REVIEW_RESTAURANT_IDS` | UUID de restaurantes autorizados, separados por comas; vacío impide envíos |

Estas variables no llevan prefijo `NEXT_PUBLIC_`. La pantalla comprueba si el canal tiene configuración para ese restaurante sin exponer credenciales. La configuración no demuestra por sí sola que Meta siga aceptando la plantilla: hace falta la prueba controlada de activación.

La plantilla necesita dos parámetros de cuerpo (primer nombre y restaurante) y un botón URL con `https://panel.gastrohelp.es/r/{{1}}`. El parámetro del botón es únicamente el UUID aleatorio de la petición. Texto propuesto para someter a aprobación:

> Hola {{1}}, gracias por tu visita a {{2}}. ¿Nos cuentas tu experiencia en Google? Tu opinión nos ayuda a mejorar. Desde el enlace también puedes dejar de recibir estas peticiones.

Botón: «Compartir mi opinión». Consultar los [componentes de plantillas de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components/) y la [API de mensajes](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api).

Solo una respuesta válida con identificador de mensaje registra aceptación por WhatsApp. No se afirma entrega al teléfono ni lectura. El modo de prueba no llama a Meta ni marca un mensaje real como enviado. Un timeout, error de servidor o respuesta sin identificador queda pendiente de revisión por GastroHelp; no se reintenta automáticamente. Si falla el guardado de la aceptación, el token de envío impide repetir el mensaje y admite registrar una aceptación tardía. Un mensaje ya en tránsito no puede retirarse al confirmar una reseña o una baja.

## Aplicación y reversión

1. Revisar los controles de CI y una vista previa con una base aislada. La migración `supabase/migrations/20260908164431_post_visit_review_requests.sql` está creada con Supabase CLI y contiene el SQL comprobado, incluido el envío desde la reserva confirmada solicitado después por Jose. Aplicarla una sola vez al completar la revisión. Comprobar que la función actual de notificaciones conserva la misma definición que la usada como base en este cambio.
2. Guardar una copia reciente y la definición anterior de `sync_reservation_automation_events`. Aplicar el SQL atómico antes del despliegue de la aplicación, que necesita los nuevos RPC. El script no hace backfill ni envía mensajes históricos. No requiere cambiar el plan de Supabase.
3. Comprobar el recorrido automático con una identidad de prueba autorizada y retirar sus datos al terminar. Validar la vista móvil, los filtros y la revisión en Google. La reserva debe conservar `atendida=null` durante el envío de esta prueba.
4. Para automatización, configurar y probar la plantilla con un destino de prueba autorizado. Añadir únicamente el restaurante validado a la lista de activación. Verificar aceptación y el comportamiento de la baja antes de usar clientes reales.
5. Si hace falta parar: desactivar «Pedir automáticamente» y retirar el restaurante de la lista del servidor. Esto cancela la cola pendiente y conserva el seguimiento y la auditoría. Para volver al código anterior, restaurar la función anterior después de detener reseñas; conservar la tabla y sus registros, sin borrado destructivo.

El cierre técnico registrado en Notion exige revisar una vista previa antes de producción y no activar mensajes reales sin una prueba autorizada con restaurante y plantillas Meta. Este cambio permanece en revisión hasta cumplir esos pasos.

## Pruebas

```sh
npm ci
npm ci --prefix tests/sql
node --test tests/review-flow.test.mjs
node scripts/test-review-schema.mjs
node scripts/test-review-concurrent.mjs
node scripts/test-review-http.mjs
npm run lint
npm run build
```

La copia de catálogo es la misma fixture saneada de la revisión de servicios: 50 tablas públicas, 5 vistas, 102 funciones, 60 triggers y 242 políticas. No contiene filas de clientes ni credenciales. Se reutiliza el restaurador de esa revisión para probar las funciones con los permisos y triggers de la aplicación.

Verificado localmente: 10 pruebas de mensaje/transporte, 17 recorridos SQL, 5 comprobaciones por HTTP, lint y compilación con Webpack. La preparación del ensayo instala dependencias propias del worktree; la compilación estándar también se comprueba en CI.

El [control de CI del código publicado](https://github.com/Joosee003/panel-restaurantes/actions/runs/34249261320), commit `112f04939182d9113f98044a1e76763bf59cbdc6`, terminó correctamente: 10 pruebas de mensaje/transporte, 17 recorridos SQL, 6 carreras entre conexiones independientes con PostgreSQL 17, 5 comprobaciones por HTTP, lint, auditoría de dependencias de producción y compilación estándar. Vercel también completó la compilación de la vista previa de ese commit.

La prueba HTTP usa las páginas y rutas reales con transporte RPC local sobre PGlite; no sustituye Supabase Auth/PostgREST, la interacción visual ni la prueba real de WhatsApp. El ensayo ya permite revisar la pantalla con una base aislada. Se han comprobado en navegador la asistencia, la espera, el envío simulado, la ausencia de duplicados, la apertura de Google y la nueva visita sin confirmación. El navegador se bloqueó con una confirmación nativa; ese aviso se sustituyó por un diálogo dentro del panel. La revisión final de ese diálogo y del ancho móvil, la prueba contra Supabase Auth/PostgREST y la recepción real de WhatsApp siguen pendientes.

## Ajuste solicitado por Jose: automático desde la reserva

El 8 de septiembre Jose aclaró que el restaurante solo debe revisar y confirmar reseñas. La reserva confirmada programa el envío sin marcar asistencia; al cumplir dos o tres horas, el proceso de fondo comprueba permiso, estado y confirmación antes de contactar con WhatsApp. Una reserva futura no cancela la solicitud de una visita anterior. El permiso opcional se guarda y la solicitud se programa en la misma transacción de reserva, sin cambiar permisos de promociones.

Se han comprobado 19 recorridos SQL, incluyendo programación sin asistencia marcada, reservas futuras, cancelación, ausencias y consentimiento en la reserva pública. Las pruebas de mensaje/transporte y las comprobaciones HTTP siguen formando parte de CI.

El programador existente de Supabase `gastrohelp-automation-dispatch` está activo cada minuto. Se comprobó mediante lectura que llama a `trigger_automation_panel_dispatch`, que apunta a `/api/automations/dispatch` y usa un nonce; sus cinco últimas ejecuciones figuraban como correctas. No se ha cambiado este programador. La integración nueva continúa pendiente de migración, despliegue y configuración de WhatsApp real.

## Vista preparada para Jose

La vista previa de la rama genera `/pruebas-resenas/index.html` y `/pruebas-resenas/mobile.html`. La compilación de producción elimina estos archivos. Se usan los mismos componentes, SQL y transporte con una respuesta de WhatsApp simulada. La base PGlite contiene únicamente datos ficticios, sin credenciales ni llamadas a Supabase o Meta.

Al abrir la página se crea una reserva ficticia con el plazo cumplido y se ejecuta el envío simulado automáticamente. El panel muestra una petición enviada, sin botones de marcar asistencia, adelantar el reloj o enviar mensajes. «Ver mensaje del cliente» muestra el contenido de la plantilla que el transporte ha preparado.

1. Pulsar «Revisar en Google» y guardar si el cliente ha dejado su reseña.
2. En «Opciones de esta prueba», simular otra visita: si sigue sin confirmar se enviará otra petición; si está confirmada, no se enviará.
3. Las opciones plegadas también permiten comprobar duplicados, simular una baja o reiniciar. Cada pestaña mantiene su propia prueba y recargar comienza de nuevo.

La revisión visual y las pruebas locales no sustituyen la comprobación con Supabase Auth/PostgREST ni la recepción real en WhatsApp. Están preparados el transporte, la migración y `docs/whatsapp-review-template.json`. La plantilla es una propuesta, no una aprobación de Meta. El emisor del piloto se identificó en n8n; falta conectar el emisor y la plantilla aprobada al servidor y usar un destino de prueba autorizado.
