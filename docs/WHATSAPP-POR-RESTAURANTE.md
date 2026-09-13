# WhatsApp propio por restaurante

Preparación de despliegue, 13 de septiembre de 2026. Este documento describe la instalación y las pruebas pendientes del transporte WAHA. Un archivo de Compose validado no acredita una conexión real ni un periodo de estabilidad ya completado.

Cada restaurante vincula su número desde el panel. La sesión de WAHA queda asociada a un restaurante en el servidor; esa asociación decide los datos que consulta el chatbot y el número desde el que salen los mensajes. No se debe elegir el restaurante a partir del texto de un cliente, de un nombre visible de WhatsApp o de un `restaurante_id` recibido sin verificar.

## Componentes

| Componente | Función |
| --- | --- |
| WAHA en servidor persistente | Mantiene las sesiones de WhatsApp y transporta mensajes y estados. |
| Backend de GastroHelp | Autoriza al usuario del panel, crea la conexión, protege el QR, valida los webhooks y aplica la separación por restaurante. |
| Base de datos de GastroHelp | Conserva la relación de cada conexión, reservas, consentimiento, estados y control de duplicados. |
| Programador existente | Despierta la cola de automatizaciones; el cambio de transporte conserva su autorización. |

El motor del chatbot y los horarios del panel siguen siendo comunes para todos los restaurantes. Cambia el transporte, no se copia una versión del chatbot por local. Una conexión nueva empieza desactivada para envíos hasta comprobar su número y habilitar el piloto. Una desconexión no autoriza a enviar desde el número común ni desde otro restaurante.

## Imagen y servidor

Se ha verificado en el registro la imagen **`devlikeapro/waha:gows-2026.8.2`**, fijada también por digest en [compose.yaml](../infra/waha/compose.yaml). La publicación real fue el **1 de septiembre de 2026**. No existe el tag simple `:2026.8.2`. El artefacto elegido publica **linux/amd64**; no debe arrancarse con emulación en un servidor ARM. [Registro del fabricante](https://hub.docker.com/v2/repositories/devlikeapro/waha/tags/gows-2026.8.2), [release](https://github.com/devlikeapro/waha/releases/tag/2026.8.2).

GOWS funciona mediante WebSocket sin Chromium. La API y los eventos pueden variar entre motores, por lo que un cambio de motor exige repetir el piloto. El coste del software no incluye el servidor, sus copias ni su mantenimiento. [Motores](https://waha.devlike.pro/docs/how-to/engines/), [instalación](https://waha.devlike.pro/docs/how-to/install/).

Antes de desplegar se necesita:

1. Acceso al servidor existente por SSH o su panel de alojamiento, con Docker y Compose v2. Confirmar arquitectura, RAM y disco libre sin afectar a n8n.
2. Un subdominio que apunte al servidor y un proxy inverso con certificado TLS válido. El nombre se configura durante el despliegue; `example.com` solo es un ejemplo.
3. Permiso de salida HTTPS/WebSocket hacia WhatsApp y HTTPS hacia el webhook del panel. WAHA no se instala como una función temporal de Vercel.
4. Un destino privado de copias y alertas de disco, proceso y conexión. Los límites iniciales de 1 CPU y 1 GiB son ajustables y deben medirse; no son una promesa de capacidad.

No se ha contratado un servidor nuevo ni una suscripción con estos archivos.

## Instalación

Desde `infra/waha`, en el servidor:

```bash
python3 initialize.py --base-url https://SUBDOMINIO-DEL-SERVIDOR
python3 preflight.py --docker
docker compose pull waha
docker compose up -d waha
docker compose ps
```

`initialize.py` genera claves aleatorias distintas para la API y los webhooks, sin mostrarlas. Crea `.env` y `backend-secrets.env` con permisos `0600`; se niega a sobrescribirlos. Estos archivos y cualquier copia de sesiones están excluidos de Git. Trasladar los valores del segundo archivo al almacén de secretos del despliegue y conservar una copia protegida; no pegarlos en chats, incidencias o capturas.

| Variable del backend | Valor |
| --- | --- |
| `WAHA_BASE_URL` | Origen HTTPS del servidor WAHA, sin credenciales, ruta ni parámetros. |
| `WAHA_API_KEY` | Clave original generada; solo en el backend. El contenedor recibe su hash SHA-512. |
| `WAHA_WEBHOOK_SECRET` | Secreto independiente para firmar/verificar eventos. |
| `GASTROHELP_WAHA_WEBHOOK_URL` | `https://panel.gastrohelp.es/api/whatsapp/waha/webhook` |

Ninguna de estas claves debe tener prefijo `NEXT_PUBLIC_`. El navegador recibe únicamente la información de conexión que corresponde al usuario autorizado y el QR temporal. No recibe la clave global ni la configuración completa de WAHA. [Autenticación de WAHA](https://waha.devlike.pro/docs/how-to/security/).

El Compose publica el puerto **solo en `127.0.0.1`**, sin modo privilegiado. El proxy debe dirigirse a ese puerto local. Si el proxy está en otro contenedor, usar una red Docker privada compartida y retirar el puerto publicado; no apuntar su `localhost` al contenedor WAHA. Esta adaptación se comprueba en el servidor concreto.

Configurar el proxy para:

- Exponer únicamente las rutas `/api/` que consume el backend mediante TLS. Conservar `X-Api-Key` sin registrarlo y no habilitar CORS general.
- Bloquear `/api/server/environment`, `/api/server/stop`, dashboard, Swagger, `/metrics`, WebSocket de administración y acceso a ficheros públicos. No permitir autenticación por parámetros de URL.
- Mantener `/health` y `/ping` privados; el healthcheck del contenedor usa loopback. Si hay IP de salida fija o red privada entre servicios, restringir además por origen. No inventar una lista de IP de Vercel.
- Evitar capturar cuerpos de mensajes, QR, cookies o cabeceras de autorización en los logs del proxy.

Después del proxy y de configurar el backend:

```bash
python3 preflight.py --network
```

Esta comprobación solo hace GET: rechaza API sin clave o con clave incorrecta, verifica versión y motor, y muestra recuentos por estado sin números ni nombres de sesiones. Rechaza redirecciones para no reenviar la clave a otro destino. No crea conexiones ni envía mensajes.

## Sesiones y webhooks

El backend crea cada sesión y su webhook. No configurar además un webhook global que duplique los mismos eventos. La suscripción debe limitarse a los eventos que procesa la aplicación, incluidos mensajes, respuestas propias y cambios de estado; evitar `*` y el volcado `engine.event`.

WAHA firma el cuerpo HTTP original con HMAC SHA-512 en `X-Webhook-Hmac`. La firma se comprueba antes de procesar datos. La sesión autenticada se resuelve en el servidor; sus metadatos son auxiliares. Se necesitan controles persistentes de duplicados, porque WAHA reintenta webhooks y un mismo mensaje puede aparecer por varias vías. Un `@lid` es un identificador y no debe convertirse a teléfono quitando letras. [Eventos y firma](https://waha.devlike.pro/docs/how-to/events/).

El endpoint existente `/api/automations/dispatch` exige un nonce UUID válido y consumible. **No basta con añadir en n8n una llamada HTTP periódica con una clave estática.** Se conserva el mecanismo que emite el nonce y despierta la cola. No se añade otro programador que vuelva a enviar los mismos eventos. Antes de activar solicitudes de reseña, comprobar una ejecución real del programador existente y el vaciado de la cola a la hora prevista.

La petición de reseña se comprueba otra vez justo antes de enviarla: restaurante, visita, permiso, demora y reseña aún no confirmada. Abrir Google no confirma una reseña. Un resultado HTTP aceptado tampoco prueba entrega al móvil: deben diferenciarse aceptación, confirmación de entrega y fallo. Un timeout incierto no se reenvía ciegamente.

## Privacidad y límites operativos

El Compose desactiva descargas de archivos, impresión del QR y logs de depuración. GOWS puede sincronizar historial al vincular el número: sus límites de historial son opciones experimentales. Se fijan antes del primer QR y se debe medir lo que realmente guarda. No se promete que nunca reciba historial. El backend no debe importar conversaciones antiguas, grupos o archivos ajenos al servicio. [Configuración GOWS](https://waha.devlike.pro/docs/engines/gows/), [archivos y logs](https://waha.devlike.pro/docs/how-to/config/).

Las credenciales de sesión persisten en el volumen `gastrohelp-waha-sessions`. Un reinicio del proceso no debería requerir otro QR si la vinculación sigue válida, pero una revocación o verificación adicional sí puede requerir al titular. Algunas cuentas pueden pedir una passkey además del QR. No ofrecer como conexión sencilla un flujo que requiera pegar scripts en DevTools. [Sesiones y verificación](https://waha.devlike.pro/docs/how-to/sessions/).

Esta conexión no es la API oficial de Meta. Puede desconectarse y WhatsApp puede limitar la cuenta. Ante restricciones de nuevos contactos, bloqueo temporal, `CAPPED` o petición de verificación, pausar envíos y avisar; no insistir con reinicios, otros números o reintentos ilimitados. Se envían únicamente comunicaciones previstas y permitidas por cada cliente. [Sesiones y restricciones](https://waha.devlike.pro/docs/how-to/sessions/).

## Copias, recuperación y actualizaciones

La copia incluye el volumen de sesiones, el Compose, el digest, los secretos protegidos y la relación de conexiones guardada en la base de datos. Las sesiones equivalen a acceso a las cuentas de WhatsApp: cifrar las copias, limitar su acceso y definir retención. No adjuntarlas a un ticket ni guardarlas en una carpeta pública.

Para una copia consistente del volumen local, programar una pausa breve de envíos, detener `waha`, copiar o tomar una instantánea del volumen y arrancarlo de nuevo. No copiar a ciegas un SQLite en escritura. Acordar la ventana antes de hacerlo con restaurantes activos. Verificar después salud, sesión y cola. La copia se prueba en un entorno aislado sin salida hacia WhatsApp; nunca arrancar simultáneamente dos servidores con las mismas credenciales de sesión.

Docker reinicia un proceso que termina según la política configurada; **un estado `unhealthy` por sí solo no dispara ese reinicio**. Deben existir alertas para proceso, disco, crecimiento de sesiones, desconexiones y cola atrasada. La salud HTTP no garantiza que cada sesión esté conectada. [Salud y observabilidad](https://waha.devlike.pro/docs/how-to/observability/).

No usar actualizaciones automáticas ni tags `latest` o `dev`. Una actualización requiere comprobar release, imagen/digest, copia recuperable y pruebas del motor. Si hay que volver atrás, pausar primero el restaurante y reconciliar mensajes con resultado incierto. Restaurar una versión anterior solo si su formato de sesión es compatible; en caso contrario usar la copia previa con el servicio detenido.

El retorno al transporte anterior es explícito por restaurante. Conserva deduplicación y reservas. Nunca cambia silenciosamente el remitente de mensajes pendientes al número común.

## Piloto antes de extenderlo

Con un número del titular y dos restaurantes de prueba, comprobar:

1. El QR solo es accesible para el restaurante autorizado, caduca/renueva y nunca aparece en logs. La sesión conectada muestra el número correcto.
2. El mismo cliente escribe a dos números: recibe los datos y horarios correctos en cada uno, y cada reserva solo aparece en su restaurante.
3. Se conservan los casos del chatbot: «hoy», personas, hora ya indicada, falta de hueco, alternativas del mismo servicio, cambios y confirmación natural.
4. Repetir un webhook no duplica respuesta ni reserva. Los mensajes enviados por el propio bot no provocan bucles; una intervención manual pausa la conversación según el control previsto.
5. «Ha venido» programa una sola reseña, respeta el plazo, envía desde el número del restaurante y deja constancia del resultado. Confirmar la reseña impide nuevas solicitudes; cancelar o retirar permiso también bloquea el envío pendiente.
6. Reinicio del contenedor, corte breve, revocación de sesión, firma inválida y timeout de envío: no mezclan restaurantes ni producen reenvíos inciertos o falsos «entregados».
7. Confirmar restauración de la copia aislada y alertas. Registrar fecha, versión, evidencias y cualquier limitación pendiente.

Tras estas pruebas comienza un periodo real de **7–14 días de observación**, con registro de desconexiones, latencia, consumo y duplicados. Ese periodo está pendiente; no puede darse por superado por haber terminado el desarrollo o una prueba puntual. Ampliar a otro restaurante solo después de revisar sus resultados.
