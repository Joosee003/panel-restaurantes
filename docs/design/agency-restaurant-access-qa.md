# Agencia → contexto de restaurante: seguridad y QA

Fecha: 26/09/2026. Rama `codex/agency-restaurant-access`. Punto de retorno del rediseño: `0fbd55e4c3fd36c49bd6ee75c354f317aff22161`.

## Identidad y frontera de seguridad

El usuario continúa autenticado como agencia. Entrar al panel selecciona un contexto de trabajo; no suplanta al propietario ni cambia su contraseña, usuario, membresía o sesión. No se crea un usuario ni se introduce `service_role` en el navegador.

El contexto solo se acepta después de verificar la sesión con `auth.getUser`, la fila propia de `app_admins`, el RPC existente `puede_acceder_restaurante`, la existencia del restaurante y su estado `activo` o `demo`. La sesión se contrasta de nuevo al terminar la resolución. Los errores de consulta deniegan acceso: no se convierten en una elección automática de otro restaurante.

La selección local a la pestaña no es una credencial ni concede permisos. Debe revalidarse antes de renderizar el panel, también tras refresh o URL interna directa. La pertenencia real a agencia procede de la comprobación de base de datos, no de `user_metadata`, un parámetro de URL ni un flag de la interfaz.

Las RLS existentes conceden a la agencia acceso global a restaurantes. Este mecanismo no transforma su JWT en uno limitado a un restaurante: la aplicación filtra cada consulta por el restaurante activo y reinicia estado/caché al cambiar. Los propietarios continúan limitados por sus membresías y las RLS existentes. No se debe describir este cambio como una nueva política de aislamiento de base de datos.

Los módulos, acciones, estados de reservas y fidelización, RPC, RLS, Storage, Realtime/polling, integraciones y contratos externos quedan intactos. «Volver a agencia» descarta el contexto sin cerrar la sesión. Logout debe descartar el contexto y las cachés del panel.

## Evidencia versionada de compatibilidad

- `lib/admin/authorize.ts`: autorización servidor existente con `auth.getUser(token)` y pertenencia a `app_admins`.
- `tests/fixtures/application-catalog-2026-09-08.json`: `is_app_admin()` usa `app_admins` y `auth.uid()`; `user_can_access_restaurant` acepta agencia auténtica o membresía del propietario. Las tablas de negocio usan este helper o `app_admin_full_access`.
- `supabase/migrations/20260809003000_close_remaining_multitenant_gaps.sql`: revoca mutación directa de membresías, invitaciones y `app_admins` a anon/authenticated.
- `supabase/migrations/20260908164431_post_visit_review_requests.sql`: asistencia valida actor, restaurante y restricciones existentes; solicitudes de reseña usan `puede_acceder_restaurante`.
- `tests/fixtures/storage-policies-2026-09-16.json`: acceso a imágenes de menus/premios mediante `user_can_access_restaurant`.
- `app/services/pedidos.service.ts`: consulta de cocina filtrada explícitamente por restaurante.

Estas fuentes son catálogo y migraciones versionados, no una lectura del estado conectado actual de Supabase. El repo no se considera un baseline productivo autosuficiente.

## Pruebas específicas

`node --test tests/agency-restaurant-access.test.mjs` ejecuta los helpers y el boundary React reales compilados desde TypeScript/TSX, con Supabase, navegación y almacenamiento del navegador simulados. No conecta a ningún proyecto y no usa credenciales ni datos reales.

Resultado local: **24/24 correctas**. ESLint de esta suite sin errores. El aviso de deprecación de `react-test-renderer` procede de la dependencia de pruebas existente y no es un fallo de ejecución.

La suite cubre:

1. Agencia → A → volver → B, preservando la misma identidad Auth.
2. Lecturas de nombre/estado restringidas exactamente al restaurante elegido.
3. Propietario rechazado por el mecanismo de agencia, incluso para su propio restaurante.
4. Claims manipulados de `user_metadata` sin capacidad para conceder rol agencia.
5. Identificador no UUID y UUID inexistente rechazados.
6. Denegación o error de permisos y errores de las consultas: acceso cerrado.
7. Restaurante inactivo, sin configuración o con estado desconocido rechazado.
8. Cambio de identidad o logout durante una resolución sin instalar contexto.
9. Revalidación del restaurante persistido, incluyendo rol revocado/estado cambiado.
10. Volver a agencia elimina selección de pestaña y valor compartido antiguo sin cambiar Auth.
11. Respuesta tardía de A no sustituye una selección posterior B; volver a agencia invalida cualquier entrada pendiente.
12. El boundary no monta el contenido privado antes de verificar permisos, muestra «Sesión de agencia / Viendo: …» y revalida en rutas internas.
13. La acción persistente vuelve a `/admin/control` sin signOut; SIGNED_OUT limpia la selección y desmonta contenido, también si había una validación pendiente.
14. AbortSignal y desmontaje del botón «Entrar al panel» evitan persistir el contexto o navegar cuando llega una respuesta tardía. Reintentar tras un error temporal vuelve a verificar antes de mostrar contenido.

La suite no acredita por sí sola los renders de todas las pantallas, los canales Realtime ni una navegación conectada. Esas comprobaciones se deben registrar aparte con identidades y restaurantes ficticios autorizados.

## SQL local y baseline anterior

Ejecutada durante la auditoría previa: `node scripts/test-security-matrix.mjs` → **171/171 correctas**. Motor PGlite/PostgreSQL efímero, catálogo saneado y datos sintéticos; ningún servidor, contraseña ni cliente real. Incluye agencia leyendo ambos restaurantes, propietarios rechazados al leer/escribir filas ajenas, rechazo de escalado por `user_metadata`, relaciones cruzadas A/B bloqueadas incluso para agencia y comprobaciones de Storage.

El baseline del rediseño (`docs/design/product-definitive-functional-baseline.md`) contiene cuatro fallos históricos de la suite de aislamiento en Windows. No son fallos introducidos por esta tarea ni se deben ocultar. La nueva batería tiene carga de módulos portátil por URL/import specifier y no replica el error de comparación de separadores de rutas de ese harness.

Regresión final de esta tarea: `node --test --test-force-exit tests/*.test.mjs`, con `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co` y `NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-test-key`: **264 casos, 260 pasan, 4 fallan, 0 omitidos**. Se observan exactamente los cuatro fallos históricos:

- `account changes discard cache even with the same restaurant; refresh preserves drafts`: observa `owner-a`, espera `owner-b`.
- `unauthorized selection is not returned; default is an assigned restaurant`: observa `foreign`, espera `null`.
- `permission lookup error fails closed and does not silently select another restaurant`: falta el rechazo `/offline/`.
- `kitchen service isolates orders for an agency account with access to both restaurants`: `TypeError: fetch failed`, `ENOTFOUND example.supabase.co`.

En la primera ejecución se observaron 262 casos, 257 correctos y 5 fallos: el quinto era `tests/agency-ui.test.mjs`, cuyo compilador manual no resolvía el nuevo import `./EnterRestaurantButton` de AgencyViews. Se corrigió el loader para compilar el helper y el botón reales; no se eliminaron assertions ni se omitieron casos. La repetición final elimina ese fallo nuevo y deja únicamente los cuatro anteriores. El total aumenta porque los tres casos de agency-ui vuelven a ejecutarse en lugar de un único fallo de carga del archivo.

## Navegador local y build

Validación del código real en el arnés aislado `local-only/product-definitive/qa` del proyecto padre, no incluido en Git ni en Vercel. Sus identidades, reservas y clientes son sintéticos; las peticiones externas están bloqueadas.

- `/admin/control`: botón «Entrar al panel» en ambos restaurantes. A (La Mesa) → Hoy con clientes de A → volver al control sin cerrar sesión → B (Casa Norte) con clientes etiquetados B y sin los de A.
- Refresh en B: verifica de nuevo y mantiene B. Navegación a Reservas, Clientes y ficha conserva «Sesión de agencia / Viendo: Casa Norte».
- Móvil de 390 × 844: barra de contexto y retorno legibles; menú y navegación a ficha operativos; sin desbordamiento horizontal (375 px de contenido, más scrollbar del navegador).
- Logout desde el menú del restaurante y desde agencia: termina en login; recargar sigue sin sesión. No reaparece el contexto B.
- B pausado en el fixture: «Entrar al panel» rechaza el acceso y permanece en control.
- Módulo Clientes desactivado: desaparece de navegación y su URL directa muestra «Clientes no está contratado»; el contexto de agencia no evita el guard existente.
- Propietario QA: `/admin/control` devuelve a su Dashboard A sin mostrar acciones de agencia. Intentar seleccionar B sin reasignar membresías no muestra datos B; el guard existente termina la sesión durante esa selección inválida. No se ha cambiado ese comportamiento del guard.
- El control antiguo «Restaurante B» del arnés reasigna expresamente la membresía sintética y no sirve para probar manipulación. Para el caso negativo se añadió «Intentar B sin membresía», que solo altera la selección.

Capturas locales: `local-only/agency-restaurant-access/captures/` (control, A, B y móvil). Son capturas del código real con adaptador sintético, **no de una sesión Supabase alojada**.

Consola de las dos pestañas de QA local: sin errores capturados al cerrar estas pruebas.

`npm run lint`, build con variables públicas ficticias y los 6 contratos del rediseño: correctos. El primer build sin variables falló por `supabaseUrl is required`; la repetición usa `https://example.supabase.co`, sin credenciales ni conexión de datos. `git diff --check`: correcto.

## QA conectada y publicación

Solo Preview, sin push, producción ni cambios de dominios. La QA conectada requiere una identidad de agencia QA y restaurantes acreditados como ficticios. No basta llamar «demo» a un restaurante para considerar sus datos seguros. No utilizar `Explora la demo`: el flujo histórico ejecuta `refresh_demo_dates`.

No se deben convertir resultados del mock local o del SQL efímero en evidencia de una sesión alojada. Si no hay identidad ficticia conectada acreditada, declarar esta limitación y entregar la Preview con las pruebas locales claramente separadas.
