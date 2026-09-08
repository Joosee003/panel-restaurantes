# Solicitudes de reseña después de una visita

Cambio solicitado por Jose el 8 de septiembre de 2026. Implementación preparada en `codex/post-visit-reviews`; no se ha aplicado el SQL a producción ni se han enviado mensajes reales.

## Funcionamiento

- La reserva recoge un permiso de WhatsApp separado y opcional para pedir opiniones después de las visitas. No concede permisos de promociones. Las variantes de formato de un mismo teléfono reutilizan el cliente existente; no se fusionan registros históricos duplicados.
- La petición se programa tres horas después de `inicio_at`, ajustable a dos. Sin `inicio_at`, se usa la hora de la reserva con la zona horaria del restaurante. Solo entra una visita que conste como atendida y no esté cancelada ni sea una ausencia.
- Una petición por reserva. Una visita posterior permite otra si el cliente sigue sin reseña confirmada y mantiene el permiso. Registrar una visita de hace más de un día no provoca un envío automático histórico.
- El panel permite abrir WhatsApp o copiar el texto. Esto guarda «Mensaje preparado». «Confirmar envío» requiere que el operador compruebe el envío.
- Cada petición tiene un enlace aleatorio `/r/[token]`. Cargarlo no cuenta como apertura de Google: se registra únicamente al pulsar el botón. No mide la llegada efectiva a Google, la publicación ni la valoración.
- El restaurante comprueba Google y marca «Confirmar reseña». Se guarda la confirmación del cliente y se cancelan sus peticiones pendientes. «Aún no aparece» registra la revisión sin confirmar. «Deshacer confirmación» permite peticiones en próximas visitas.
- La baja se ofrece en el enlace incluso si el restaurante elimina la URL de Google o deja de usar el módulo. A partir de la baja no se registran nuevas aperturas asociadas al permiso ni se envían nuevas peticiones.
- Se conservan la consulta de reseñas guardadas y la preparación de sus respuestas.

La solicitud pide una opinión honesta, sin seleccionar clientes según la valoración ni ofrecer incentivos. Véase la [política de contenido de Google Maps](https://support.google.com/contributionpolicy/answer/7400114?hl=en).

## Envío automático

Se usa la cola existente `reservation_webhook_deliveries`, con el identificador estable `visit.review_request:<reserva>`. Las notificaciones de reservas y fidelización conservan su transporte actual. El nuevo evento de reseña se entrega por la API oficial de WhatsApp, con plantilla; no pasa por el webhook genérico que podría dar un HTTP 200 sin haber enviado un mensaje.

El envío exige:

1. Módulos de reseñas y automatizaciones activos; configuración habilitada, modo `live`, WhatsApp y petición de reseña habilitados.
2. Visita atendida, hora vencida, permiso vigente, cliente sin reseña confirmada y enlace de Google válido.
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

Solo una respuesta válida con identificador de mensaje registra aceptación por WhatsApp. No se afirma entrega al teléfono ni lectura. El modo de prueba no llama a Meta ni marca un mensaje real como enviado. Un timeout, error de servidor o respuesta sin identificador queda «Comprobar envío»; no se reintenta automáticamente. Si falla el guardado de la aceptación, el token de envío impide repetir el mensaje y admite registrar una aceptación tardía. Un mensaje ya en tránsito no puede retirarse al confirmar una reseña o una baja.

## Aplicación y reversión

1. Revisar los controles de CI y una vista previa con una base aislada. El borrador es `docs/sql/post-visit-reviews.sql`; convertirlo en migración versionada usando Supabase CLI antes de publicarlo. Comprobar que la función actual de notificaciones conserva la misma definición que la usada como base en este cambio.
2. Guardar una copia reciente y la definición anterior de `sync_reservation_automation_events`. Aplicar el SQL atómico antes del despliegue de la aplicación, que necesita los nuevos RPC. El script no hace backfill ni envía mensajes históricos. No requiere cambiar el plan de Supabase.
3. Comprobar el recorrido manual con una identidad de prueba autorizada y retirar sus datos al terminar. Validar la vista móvil, el botón de WhatsApp, los filtros y la confirmación en navegador.
4. Para automatización, configurar y probar la plantilla con un destino de prueba autorizado. Añadir únicamente el restaurante validado a la lista de activación. Verificar aceptación y el comportamiento de la baja antes de usar clientes reales.
5. Si hace falta parar: desactivar «Pedir automáticamente» y retirar el restaurante de la lista del servidor. Esto cancela la cola pendiente y conserva el seguimiento manual y la auditoría. Para volver al código anterior, restaurar la función anterior después de detener reseñas; conservar la tabla y sus registros, sin borrado destructivo.

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

Verificado localmente: 10 pruebas de mensaje/transporte, 17 recorridos SQL, 5 comprobaciones por HTTP, lint y compilación con Webpack. Turbopack local no admite el enlace a dependencias fuera del worktree; CI instala dependencias normales y ejecuta la compilación estándar.

Las 6 carreras entre conexiones independientes están incluidas en CI con PostgreSQL 17. El entorno local no permite arrancar el proceso con un usuario sin privilegios; su resultado debe comprobarse en CI. El navegador remoto tampoco pudo abrir el servidor local. La prueba HTTP usa las páginas y rutas reales con transporte RPC local sobre PGlite; no sustituye Supabase Auth/PostgREST, la interacción visual ni la prueba real de WhatsApp.
