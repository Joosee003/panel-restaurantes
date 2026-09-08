# Solicitudes de reseña después de una visita

Cambio solicitado por Jose el 8 de septiembre de 2026 y publicado con su autorización en la [PR 40](https://github.com/Joosee003/panel-restaurantes/pull/40), rama `codex/post-visit-reviews`. No se ha aplicado el SQL a producción ni se han enviado mensajes reales.

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

1. Revisar los controles de CI y una vista previa con una base aislada. La migración `supabase/migrations/20260908164431_post_visit_review_requests.sql` está creada con Supabase CLI y conserva exactamente el SQL probado. Aplicarla una sola vez al completar la revisión. Comprobar que la función actual de notificaciones conserva la misma definición que la usada como base en este cambio.
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

Verificado localmente: 10 pruebas de mensaje/transporte, 17 recorridos SQL, 5 comprobaciones por HTTP, lint y compilación con Webpack. La preparación del ensayo instala dependencias propias del worktree; la compilación estándar también se comprueba en CI.

El [control de CI del código publicado](https://github.com/Joosee003/panel-restaurantes/actions/runs/34249261320), commit `112f04939182d9113f98044a1e76763bf59cbdc6`, terminó correctamente: 10 pruebas de mensaje/transporte, 17 recorridos SQL, 6 carreras entre conexiones independientes con PostgreSQL 17, 5 comprobaciones por HTTP, lint, auditoría de dependencias de producción y compilación estándar. Vercel también completó la compilación de la vista previa de ese commit.

La prueba HTTP usa las páginas y rutas reales con transporte RPC local sobre PGlite; no sustituye Supabase Auth/PostgREST, la interacción visual ni la prueba real de WhatsApp. El ensayo ya permite revisar la pantalla con una base aislada. Se han comprobado en navegador la asistencia, la espera, el envío simulado, la ausencia de duplicados, la apertura de Google y la nueva visita sin confirmación. El navegador se bloqueó con una confirmación nativa; ese aviso se sustituyó por un diálogo dentro del panel. La revisión final de ese diálogo y del ancho móvil, la prueba contra Supabase Auth/PostgREST y la recepción real de WhatsApp siguen pendientes.

## Recorrido preparado para Jose

La vista previa de la rama genera `/pruebas-resenas/index.html` y `/pruebas-resenas/mobile.html`. La compilación de producción elimina estos archivos. La prueba carga en el navegador una copia de la base PGlite con el esquema y los permisos de la aplicación, la migración de reseñas y registros ficticios. No necesita credenciales ni consulta Supabase o Meta. Se usan los mismos componentes del panel y del enlace del cliente, y el mismo código de envío con una respuesta de WhatsApp simulada. Al recargar empieza de nuevo; los cambios no se guardan en un servidor.

1. Marcar la visita: aparece programada y aún no permite preparar el mensaje.
2. Adelantar el reloj: se habilita la petición. Probar el envío automático o abrir el borrador manual y confirmar el envío.
3. Abrir el enlace como cliente y pulsar Google: el panel debe pedir una revisión, con la reseña aún sin confirmar.
4. Marcar «Aún no aparece» y añadir otra visita: al realizarla y pasar el plazo permite otra petición.
5. Confirmar la reseña: cancela pendientes y no vuelve a pedirla en otra visita. Se puede deshacer la confirmación.
6. Retirar permiso o darse de baja desde el enlace: las peticiones pendientes quedan canceladas.
7. Reiniciar para probar los dos plazos, filtros, tema oscuro y ancho de móvil.

El ensayo del navegador comprueba la interfaz y el SQL; no sustituye una prueba contra Supabase Auth/PostgREST ni la recepción real en WhatsApp. Para esa última prueba quedan preparados el transporte, la migración y `docs/whatsapp-review-template.json`. La plantilla es una propuesta, no una aprobación de Meta. El emisor del piloto existente se ha identificado en el flujo n8n el 8 de septiembre de 2026; no se han copiado credenciales ni activado envíos. Hay que conectar el emisor y la plantilla aprobada al servidor y acordar el destino antes de enviar.
