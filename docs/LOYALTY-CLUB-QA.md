# Club de fidelización por QR — paquete QA

Estado: implementado en la rama `codex/qa-loyalty-club`; no desplegado ni migrado en producción.

Archivos de implementación presentes (22; 5 modificados y 17 nuevos, sin contar capturas locales):

```text
app/(app)/clientes/page.tsx
app/(app)/dashboard/fidelizacion/canjes/page.tsx
app/c/[token]/page.tsx
next.config.ts
package.json
app/(app)/dashboard/fidelizacion/club/page.tsx
app/(app)/dashboard/fidelizacion/escanear/page.tsx
app/api/club/wallet/google/route.ts
app/api/club/wallet/route.ts
app/club/[slug]/ClubExperience.tsx
app/club/[slug]/QrCode.tsx
app/club/[slug]/club.module.css
app/club/[slug]/page.tsx
docs/LOYALTY-CLUB-QA.md
lib/wallet/apple.ts
lib/wallet/authorized-context.ts
lib/wallet/capabilities.ts
lib/wallet/google.ts
lib/wallet/types.ts
scripts/loyalty-preview-mock.mjs
scripts/test-loyalty-club.mjs
supabase/migrations/20261004120000_loyalty_club_qr_wallet.sql
```

Revisión local del 2026-10-04: TypeScript, ESLint y build superados; 15 comprobaciones SQL específicas, 171 controles de aislamiento y la regresión de reservas/asistencia superados. Se revisaron visualmente la entrada pública, área móvil, QR de socio y premio, material imprimible y escáner con respuestas sintéticas; perfiles Pixel 10 (360 px) e iPhone 15 (393 px), sin desbordamiento horizontal. Las capturas están en `.playwright-cli/` del repositorio de trabajo. La cámara física, el OTP real y enlaces WhatsApp reales siguen sin prueba extremo a extremo.

QA no se ha modificado: `gh qa status`, `gh supabase qa status` y `gh backup status` devuelven `Permission denied (publickey)`. Faltan acceso SSH restringido válido, backup verificable, migración aplicada en QA, imagen inmutable del SHA de esta rama y pruebas de dos restaurantes sintéticos antes de cualquier despliegue seguro. El estado versionado de operaciones indica además que los hooks root-owned y el pipeline GHCR aún no están instalados.

## Flujo y límites

- `/club/[slug]` es la entrada pública fija del restaurante. Solo abre registro/acceso y nunca crea visitas, puntos ni canjes.
- El cliente se autentica con OTP de teléfono de Supabase. La sesión del club usa un almacenamiento separado de la sesión de operador.
- `club_join_restaurant` enlaza primero el cliente más antiguo del mismo restaurante cuyo teléfono normalizado coincida. Solo crea una ficha si no existe ninguna y exige la versión de consentimiento vigente. No concede permisos de WhatsApp o email comercial.
- El QR personal `ghm_<uuid>` solo identifica al cliente. La visita se escribe después de pulsar `Registrar visita`, con una clave idempotente por escaneo.
- El QR temporal `ghr_<token>` representa un canje pendiente, caduca a los cinco minutos y solo se conserva como hash SHA-256. Solicitarlo no cambia el saldo.
- El empleado ve cliente, premio y coste antes de confirmar. La confirmación bloquea el canje y el saldo, descuenta mediante un único movimiento y marca el token como usado en la misma transacción.
- Los canjes heredados que ya tenían movimiento de débito se marcan durante la migración para no volver a descontarlos. Cancelar una solicitud nueva no abona puntos que nunca se quitaron.

## Datos y aislamiento

La migración `20261004120000_loyalty_club_qr_wallet.sql` añade identidades de club, tokens temporales, evidencia de débito, idempotencia de visitas y registro/outbox de Wallet. Las tablas operativas nuevas tienen RLS activa y no conceden escritura directa al navegador. Las operaciones se hacen por RPC con comprobación de identidad o `user_can_access_restaurant`, restaurante explícito y bloqueo de usuarios demo en mutaciones.

Los duplicados históricos no se borran ni reasignan. Un trigger impide crear otro teléfono normalizado dentro del mismo restaurante; la vinculación conserva el registro más antiguo cuando ya existan duplicados heredados.

## Wallet

Google Wallet puede emitir un objeto de fidelización real con QR personal mediante JWT RS256. El botón queda oculto salvo que existan:

- `GOOGLE_WALLET_ISSUER_ID`
- `GOOGLE_WALLET_CLASS_ID`
- `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_WALLET_PRIVATE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `GOOGLE_WALLET_CONFIGURATION_VERIFIED=1`, que solo se establece después de validar cuenta, clase, firma y guardado en QA.
- `SUPABASE_SERVICE_ROLE_KEY` ya usada por el servidor; solo el endpoint verificado puede registrar el objeto del pase. Nunca se expone al navegador.

Apple Wallet permanece desactivado: aún falta implementar y validar el firmante `.pkpass`, la cadena WWDR y el transporte APNs. No se muestra un botón ficticio.
Para habilitarlo más adelante harán falta `APPLE_WALLET_PASS_TYPE_IDENTIFIER`, `APPLE_WALLET_TEAM_IDENTIFIER`, `APPLE_WALLET_CERTIFICATE_BASE64`, `APPLE_WALLET_PRIVATE_KEY_BASE64`, `APPLE_WALLET_WWDR_CERTIFICATE_BASE64`, `APPLE_WALLET_APNS_KEY_ID` y `APPLE_WALLET_APNS_PRIVATE_KEY_BASE64`, además de la implementación firmante y pruebas reales con Apple. Nombrar estas variables no las configura ni habilita el pase.

Las altas de pases y los cambios de puntos/visitas generan una outbox transaccional. La actualización automática no se anuncia como activa hasta desplegar y verificar un procesador de esa outbox para cada proveedor.

## Pruebas

```powershell
npm run test:loyalty-club
node scripts/test-security-matrix.mjs
node scripts/test-review-schema.mjs
npm run lint
npx tsc --noEmit
npm run build
```

La prueba específica usa PostgreSQL desechable en PGlite y datos sintéticos. Cubre reutilización del cliente de WhatsApp, reintentos sin duplicado, aislamiento entre restaurantes, QR público sin visita, solicitud sin débito, doble confirmación con un único débito, token usado/caducado, compatibilidad con débitos heredados y visita manual idempotente. PGlite ejecuta las sesiones de rol en secuencia; la carrera real con dos conexiones PostgreSQL queda pendiente en QA, aunque las funciones usan bloqueos transaccionales e índices únicos.

## Secuencia de QA y rollback

1. Obtener snapshot/backup verificable de QA y registrar el SHA de aplicación.
2. Aplicar la migración en QA; no ejecutar contra producción.
3. Desplegar el mismo SHA en QA, sin configurar proveedores reales de mensajes ni Wallet de producción.
4. Ejecutar la matriz anterior y recorridos con dos restaurantes ficticios, teléfono de prueba autorizado y recompensas sintéticas.
5. Solo activar Google Wallet tras una prueba real controlada del emisor de QA y dejar constancia externa.

Rollback recomendado: retirar primero el despliegue de aplicación al SHA anterior. Las tablas/columnas nuevas son aditivas y deben conservarse para no perder identidades, canjes ni trazabilidad. Revocar temporalmente los RPC públicos del club si hace falta contener el acceso. No borrar tablas ni revertir débitos; una retirada destructiva requiere copia, conciliación explícita de canjes y una migración separada aprobada.
