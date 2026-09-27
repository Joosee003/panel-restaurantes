# Segundo frontend QA para Work — NO PRODUCCIÓN

Paquete preparado el 27/09/2026. Rama de entrega: `codex/qa-frontend-v2`.
Aplicación congelada en **`1f79ed21320d78ab3d26557e30a5b6212f9357a7`**.
El commit de entrega añade solo este empaquetado, pruebas y el bloqueo de auto-deploy Vercel de esta rama. No cambia `app`, `lib`, `public`, dependencias, configuración Next, migraciones ni reglas.

Retornos conservados: `codex/agency-restaurant-access` → `1f79ed2`;
`codex/gastrohelp-product-definitive` → `0fbd55e`.
No hacer merge a `main`, desplegar en Vercel ni ejecutar el Dockerfile histórico de la raíz.

## 1. Puerta de seguridad antes del despliegue

Work debe verificar en el servidor, sin modificar backend:

- Checkout nuevo, separado del frontend y Compose de `qa.gastrohelp.es` y de producción. No copiar `.env`, volúmenes, `.next` ni credenciales de esos checkouts.
- Hostname separado protegido, por ejemplo `v2.qa.gastrohelp.es`; Work decide el nombre final. El validador admite exclusivamente `qa.gastrohelp.es` y subdominios `*.qa.gastrohelp.es` para Supabase, y solo un subdominio distinto para el frontend. Si el endpoint aislado real usa otro namespace, **detenerse** y revisar esta restricción explícitamente; no abrir Supabase al exterior ni usar un hostname Docker en el navegador.
- Identificar por lectura la API HTTPS **real del Supabase QA**, su posible prefijo de ruta y protección. Servidor y navegador usan la MISMA `NEXT_PUBLIC_SUPABASE_URL`. El hostname de la web por sí solo no identifica la API.
- Verificar que anon y service-role pertenecen a esa instancia QA (las comprobaciones de formato/rol locales NO verifican firma ni procedencia).
- La red QA existente y sus reglas deben permitir únicamente el acceso necesario al Supabase QA/proxy; probar que el contenedor nuevo no alcanza Supabase Production, n8n, Meta ni WAHA. **El nombre de la red y `internal=true` no acreditan por sí solos el aislamiento.** No modificar firewall/servicios productivos para hacerlo funcionar.
- Verificar en lectura cron desactivado, triggers/destinos externos, Mailpit y `private_integration_endpoints`. El dispatcher puede obtener una URL productiva desde la DB aunque no haya variables n8n. No procesar colas ni disparar envíos para probarlo.
- No crear usuarios ni cambiar Auth, RLS, esquema, migraciones o n8n. Si el nuevo origen requiere cambiar Auth/CORS/aislamiento, detenerse y pedir esa autorización aparte.

No desplegar si cualquiera de esas condiciones queda sin verificar.

## 2. Entradas privadas, fuera del checkout

Dos archivos con permisos restringidos, propiedad del operador; nunca Git, chat, logs ni capturas:

1. JSON de configuración **pública de QA**, objeto con exactamente estas claves (sin valores de ejemplo operativos):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL`
2. Archivo de una línea con la clave QA `SUPABASE_SERVICE_ROLE_KEY` (montado únicamente en runtime).

Compose local monta los secretos de archivo como bind mounts: no confiar en `uid/gid/mode` de la sección secrets para cambiar permisos. El runtime `node` necesita lectura efectiva (UID/GID 1000 de esta imagen, considerando user namespaces/rootless). Usar archivo privado con propietario/ACL específicos que permitan esa lectura; no hacerlo legible por todos ni elevar el contenedor a root. Conservar privados también los directorios del operador. Comprobar sin mostrar el contenido, antes de arrancar Next:

```sh
docker compose -f infra/qa-frontend-v2/compose.yaml run --rm --no-deps --entrypoint node frontend-v2 -e "require('node:fs').accessSync('/run/secrets/supabase_service_role',require('node:fs').constants.R_OK)"
```

Ese preflight se ejecuta después de construir la imagen y verificar la red QA; solo comprueba permisos del montaje.

La clave pública puede ser anon JWT o publishable; nunca service-role. No definir `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: el código ya usa ANON como fallback y así no se hereda una segunda clave. No proporcionar variables de Vercel, Production, n8n, WhatsApp, Meta ni `DEMO_USER_EMAIL`.

El JSON público se monta mediante BuildKit solo para `next build`. Sus valores son públicos y quedan congelados en el bundle; se conservan en la imagen para asegurar la misma configuración en servidor. Si cambian, reconstruir. La clave de servidor no participa en el build, ARG, ENV de imagen, etiquetas ni capas. Se lee de `/run/secrets/supabase_service_role` al arrancar, se valida que no aparezca en assets públicos y se pasa solo al proceso Node. Acceso Docker/root sigue siendo acceso privilegiado: no publicar `docker inspect` del proceso ni logs con secretos.

Los scripts fallan si detectan variables de aplicación heredadas, claves de rol incorrecto, hosts fuera de QA o referencias/claves privadas en assets cliente/prerenderizados. No son un sustituto de RLS, de la validación de procedencia de las claves ni del firewall.

## 3. Checkout y build reproducible

Obtener la rama de GitHub en un checkout nuevo; fijar el **SHA completo del commit de entrega** comunicado por Codex, no seguir una rama móvil. Comprobar árbol limpio y ancestro:

```sh
git status --porcelain
git rev-parse HEAD
git merge-base --is-ancestor 1f79ed21320d78ab3d26557e30a5b6212f9357a7 HEAD
git diff --exit-code 1f79ed21320d78ab3d26557e30a5b6212f9357a7 HEAD -- app lib public scripts package.json package-lock.json next.config.ts supabase
```

Configurar estas variables del operador en la shell **solo con metadatos/rutas**, sin claves:

- `SOURCE_COMMIT`: SHA completo verificado de HEAD.
- `QA_PUBLIC_CONFIG_FILE`: ruta absoluta del JSON privado anterior.
- `QA_PUBLIC_CONFIG_SHA256`: SHA256 de ese archivo público; invalida la caché BuildKit al cambiar configuración. Se comprueba antes de compilar, sin imprimir contenido.
- `QA_SERVICE_ROLE_FILE`: ruta absoluta del archivo de clave QA.
- `QA_DOCKER_NETWORK`: red QA ya existente y comprobada.
- `QA_FRONTEND_PORT`: puerto loopback libre y distinto del frontend anterior.

No usar `set -x`. Docker Engine/BuildKit y Compose v2 son necesarios. Construir sin importar variables de aplicación de otros proyectos:

```sh
export QA_PUBLIC_CONFIG_SHA256="$(sha256sum "$QA_PUBLIC_CONFIG_FILE" | cut -d ' ' -f 1)"
docker compose -f infra/qa-frontend-v2/compose.yaml build frontend-v2
```

Node está fijado a 24.11.1 y digest de imagen oficial; `npm ci` usa el lockfile existente. No se actualizan paquetes. Se conservan dependencias de desarrollo para que `next start` cargue sin cambios `next.config.ts`; no es una optimización de tamaño de imagen. El contexto allowlist excluye secretos, `.env*`, Git, artefactos locales, volcados y dependencias del host. Build no ejecuta SQL/migraciones.

`NODE_ENV=production` es exclusivamente el modo optimizado de Next, **no** una selección del entorno Production. No hay export estático, cambio de contratos ni servidor alternativo.

## 4. Arrancar solo el segundo frontend

Después de comprobar el aislamiento efectivo y revisar la imagen:

```sh
docker compose -f infra/qa-frontend-v2/compose.yaml up -d --no-build --no-deps frontend-v2
docker compose -f infra/qa-frontend-v2/compose.yaml ps
```

Proyecto `gastrohelp-qa-v2`, servicio nuevo `frontend-v2`, puerto publicado únicamente en `127.0.0.1`. Sin host networking, Docker socket, volúmenes de datos ni usuarios root. No ejecutar el Compose antiguo, `down`, `prune`, migraciones ni restauraciones.

Work añade únicamente el virtual host QA alternativo al proxy aprobado, con HTTPS y la protección de acceso QA equivalente. No cambiar el virtual host `qa.gastrohelp.es` ni dominios productivos. Mantener host/protocolo reenviados correctos, WebSocket/Realtime y streaming; sin caché compartida para páginas autenticadas. Añadir `X-Robots-Tag: noindex, nofollow, noarchive` al host QA completo.

Bloquear en el virtual host alternativo `/demo`, `/api/demo/session`, `/api/automations/dispatch`, `/api/chatbot` y sus subrutas, `/api/whatsapp` y sus subrutas. No usar `Explora la demo`, invitaciones, recuperación de contraseña, configuración WhatsApp ni acciones de envío durante esta QA. Esto no elimina la necesidad de aislamiento de salida y no cambia los servicios existentes.

El firewall del contenedor no controla los enlaces abiertos por el navegador. El código congelado conserva enlaces `wa.me` y URLs productivas en materiales/QR: no abrirlos, generar materiales ni contactar destinatarios; comprobar el host antes de seguir cualquier enlace externo. Esta entrega no convierte todo el producto en un sandbox de navegación.

## 5. Validación antes de entregar la URL

- Registrar SHA, image ID/digest, hostname elegido, red/puerto y resultado; nunca valores de claves.
- Inspeccionar configuración/historial de imagen en privado: ninguna clave de servicio. `/login` healthcheck solo acredita HTTP, no Auth/RLS.
- En navegador: HTML/JS/RSC/red sin service-role; origen Supabase exclusivamente QA. `.env`, `.git`, `qa-public-config.json`, `/run/secrets/…` y `.next/server` no deben servirse por HTTP.
- Login seguro `owner-a@example.invalid` → solo `QA Restaurante A`. No usar cuenta agencia para acreditar aislamiento del propietario. No crear cuentas si falta identidad agencia QA.
- Con agencia QA existente y verificada: A → volver → B, refresh, rutas internas, restaurante no autorizado, módulos apagados y logout. No confundir QA sintética anterior con esta prueba alojada.
- Dashboard/Hoy, Reservas, Clientes, ficha, Sala y móvil 390 px. Solo datos ficticios; ninguna escritura real ni prueba de envíos. Revisar consola/runtime y que el frontend sea el rediseño `1f79ed2`.
- Comprobar que el frontend QA anterior y Production siguen iguales.

## 6. Rollback del frontend temporal

Retirar únicamente el virtual host alternativo añadido por Work y parar el servicio nuevo:

```sh
docker compose -f infra/qa-frontend-v2/compose.yaml stop frontend-v2
```

No eliminar datos, redes QA compartidas, Auth, servicios anteriores ni imágenes de retorno. El frontend de `qa.gastrohelp.es` no se sustituye en ningún momento.

## Comprobaciones locales y límites

Pruebas del paquete: `node --test tests/qa-frontend-packaging.test.mjs`.
Regresión agencia: `node --test tests/agency-restaurant-access.test.mjs`.
También ejecutar `npm run lint`, `npm run build` con configuración sintética sin clave privada y `git diff --check`.

La máquina de preparación no dispone de Docker: la imagen Linux, el proxy y la QA autenticada deben validarse en Hetzner por Work antes de publicar el hostname. No afirmar que el empaquetado equivale a esa validación.

La suite de contratos del rediseño sigue comparando todos los archivos protegidos con su baseline. Su única excepción de empaquetado es comprobar exactamente el bloqueo Vercel de `codex/qa-frontend-v2`; no se omite la comprobación de ese archivo ni se permiten otros cambios de configuración.

Evidencia local del 27/09/2026:

- Lint y build Next con URL/clave pública sintéticas, sin service-role: correctos.
- 36/36 casos específicos: paquete, agencia y contratos del rediseño.
- Regresión `node --test --test-force-exit tests/*.test.mjs`: 270 casos, 266 correctos y los mismos cuatro fallos Windows del baseline, detallados en `docs/design/agency-restaurant-access-qa.md`; ningún fallo adicional.
- 787 archivos públicos/prerenderizados y 40 respuestas HTTP locales (incluidos 26 assets y RSC): sin clave privada/canario. Rutas privadas de archivos: 404; API admin anónima: 401. Esta prueba no acredita una sesión conectada.
- Gitleaks 8.30.1: sin secretos nuevos en historial local y cambios de entrega. El árbol completo solo señala el fixture HMAC sintético de `tests/waha-inbound.test.mjs:17`, revisado e idéntico al ya existente en `origin/main`; no se ha alterado para silenciar el escáner.
- Sin `.env` reales, `local-only`, volcados ni claves privadas en la entrega. El histórico `infra/waha/.env.example` ya existente contiene exclusivamente placeholders, no se utiliza en este paquete.

Referencias: [Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [Docker build secrets](https://docs.docker.com/build/building/secrets/), [bloqueo de auto-deploy por rama Vercel](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled).
