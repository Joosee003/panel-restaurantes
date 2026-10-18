# Fidelización V2 — cierre del bloque 2

**Corte:** 18/10/2026. Rama de publicación: `codex/loyalty-v2-release`, basada en reseñas publicadas (`6b105ace`). El commit histórico `66819d6` se recuperó por cherry-pick, junto con las correcciones locales de OTP verificado, niveles e historial. Wallet se excluyó: no hay botón, API, outbox ni promesa de pase operativo en esta versión.

## Reglas y alcance

- El QR público abre el club; no suma visitas ni puntos. El acceso del cliente requiere OTP de teléfono confirmado y consentimiento de club. Se reutiliza la ficha existente por teléfono normalizado dentro del restaurante, incluso si vino de WhatsApp; no se cambia el consentimiento comercial.
- El QR personal identifica. El personal confirma la visita. Si hay una reserva reciente del mismo cliente, se registra su asistencia en esa reserva; un escaneo repetido y «Ha venido» comparten esa visita. El consumo de esa reserva se registra desde la reserva, con sus reglas existentes de puntos. La visita manual sin reserva usa la función existente de historial.
- El cliente confirma que quiere preparar el QR del premio. Solicitarlo no descuenta; caduca a los cinco minutos y se guarda solo su hash. Confirmar en el panel bloquea token, canje y saldo, descuenta una vez y deja evidencia. Otro restaurante, otro usuario, un QR usado o caducado no pueden confirmar.
- Los canjes antiguos con débito identificable no se vuelven a descontar. Un canje histórico pendiente sin evidencia suficiente requiere conciliación individual; no se adivina el saldo. El preflight alojado detectó **un** canje en esa situación y no se modifica su dato.
- Desactivar el módulo de fidelización impide nuevas solicitudes y confirmaciones. Los datos históricos se conservan.
- El escáner usa `BarcodeDetector` cuando existe y decodificación local `jsQR` para Safari/iPhone. La cámara física del iPhone sigue requiriendo comprobación por el usuario.

## Evidencia previa a publicación

| Fecha | Entorno | Prueba | Resultado |
|---|---|---|---|
| 18/10/2026 | PGlite, catálogo sintético | `npm run test:loyalty-club` | 19 controles superados: OTP, reutilización, aislamiento, visita, niveles, saldo, caducidad, histórico y módulo desactivado. |
| 18/10/2026 | PostgreSQL 17 local, 3 conexiones | `node scripts/test-loyalty-concurrent.mjs` con `GH_LOCAL_POSTGRES_BIN` | Dos confirmaciones contendieron por el bloqueo; una se rechazó y hubo un único débito/movimiento. |
| 18/10/2026 | Local sintético | `node scripts/test-security-matrix.mjs`; `node scripts/test-review-schema.mjs` | 171 controles de seguridad y regresión de reseñas superados. |
| 18/10/2026 | Local, variables públicas ficticias | `npx tsc --noEmit`; `npm run build`; ESLint de archivos cambiados | Superados. El lint completo conserva un error preexistente en `tests/meta-review-routing.test.mjs`. |
| 18/10/2026 | Supabase `gastrohelp-panel` Production, lectura | Esquema y conteos agregados | Migración V2 aún ausente al corte; 6 canjes pendientes, uno sin movimiento de débito que lo acredite; ninguna fila histórica se cambió. |
| 18/10/2026 | Vercel Preview | Commit remoto `78369b937d279d2d686f4e2c7f8059d6c681e26e`, deployment `dpl_AXKZERLVEFuqCwBVwjtQBBoN4Dih` | `READY`; todavía no promovido al dominio principal. |
| 18/10/2026 | PostgreSQL 17 local | Aplicación de migración y restauración de las tres funciones previas desde `supabase/rollback/20261018_loyalty_v2_restore_legacy_functions.sql` | Transacción de reversión superada; saldo y movimiento del canje de prueba permanecieron intactos. El script bloquea la reversión si quedan canjes V2 pendientes. |

El laboratorio local no acredita OTP alojado, cámara física ni aplicación publicada.

## Publicación, prueba y reversión

Publicar solo el commit de esta rama en el proyecto Vercel actual, sin tocar workflows de reseñas. Aplicar únicamente la migración `20261004120000_loyalty_club_qr_wallet.sql` al proyecto Supabase verificado `yyiotkszobortppwiqal`; el nombre histórico del archivo conserva `wallet`, pero su SQL ya no lo incluye. Las tablas y columnas son aditivas; los únicos datos previos que marca son canjes con un movimiento de débito exacto. No borrar ni reasignar el canje sin evidencia.

El rollback de aplicación es el deployment anterior `dpl_8kpMrNd5WBa1ienSV3MuQyxPjnhY` (`6b105ace`). Si hay un incidente, retirar el nuevo deployment del dominio, detener las pruebas V2 y conservar las tablas, tokens y débitos nuevos para conciliación. El SQL de reversión restaura solo las tres funciones que la migración reemplaza; antes de usarlo se deben resolver los canjes V2 pendientes y verificar los confirmados. Su guarda rechaza ejecutarlo si quedan pendientes. No borrar tablas ni restaurar saldos por intuición.

**Punto de publicación:** el conector Supabase rechazó automáticamente aplicar la migración en Production por no reconocer el encargo adjunto como autorización suficiente y por requerir reversión probada. Se preparó y probó la reversión local; la promoción a `panel.gastrohelp.es` queda detenida hasta recibir autorización explícita en el chat y aplicar la migración.

Tras publicación, la prueba alojada debe usar un restaurante ficticio identificado, OTP introducido por el usuario en la web y canje/visita sintéticos. Verificar desde las pantallas normales, cerrar sesión y volver a entrar, y comprobar persistencia. El iPhone físico debe abrir la página HTTPS del panel, permitir cámara, escanear QR personal y QR de premio y comprobar que la confirmación visible coincide con el saldo; la emulación de escritorio no sustituye esa prueba.
