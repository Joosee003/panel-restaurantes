# Conexiones de Sala, reservas y cuentas QR

Actualizado el 8 de septiembre de 2026. Rama `codex/connect-restaurant-services`, base `b6ea46b`.
[Propuesta en borrador #39](https://github.com/Joosee003/panel-restaurantes/pull/39).

**Implementado y probado localmente; no instalado en Supabase ni publicado en producción.** El piloto de Hispanos Grill sigue sin activarse; Jose ha enviado la propuesta y está pendiente de respuesta. Las condiciones comerciales vigentes se registran en Notion.

## Preparado

1. **Sala:** lecturas completas por eventos, cada 45 segundos con pestaña visible y al volver. Descarta respuestas de otra fecha/restaurante y conserva la última lectura completa ante fallos. Un error no convierte las mesas en aparentemente libres.
2. **Plazas:** conexión opcional, apagada por defecto. Limita cupos por asientos de mesas activas, no bloqueadas, en zonas activas. Comprueba también al guardar y conserva reservas ya aceptadas. No calcula combinaciones ni cambia cupos externos.
3. **Cuenta QR:** separación por restaurante, mesa y sesión, lectura completa de pedidos abiertos, comprobación antes de confirmar y validación bajo bloqueo. Las líneas y el total deben cuadrar. No ejecuta cargos bancarios ni emite facturas.
4. **Protección del servidor:** exige módulo QR activo; impide modificar cuentas y líneas finales, fabricar cierres o marcar directamente un pedido cobrado desde la API. Mantiene solo el refresco de fechas de los cuatro pedidos ficticios de demostración mediante su función propietaria, sin cambiar su contenido.
5. **QR → reserva → cliente:** reserva elegida expresamente, misma mesa/restaurante/servicio y cliente ya asignado. Cierre, consumo neto sin propina, visita y puntos se guardan en una transacción. La fidelización debe estar activa para sumar puntos. No se deduce identidad ni se concede consentimiento de contacto. Un consumo manual previo requiere revisión.
6. **Respuesta perdida:** petición con identificador estable guardada antes del envío. «Comprobar cierre pendiente» repite exactamente esa petición y recupera el mismo resultado. Una respuesta antigua no borra otra operación y un rechazo del reintento no demuestra que el intento anterior no se guardó.
7. **Consumo manual:** corregida la diferencia entre puntos guardados y mostrados cuando no existe configuración propia de fidelización. Respuesta, reserva y notificación leen el movimiento realmente generado por el historial. Los clientes nuevos quedan sin permiso de marketing automático; se comprueba que el cliente asignado pertenece al restaurante antes de registrar la visita.
8. **QR y rentabilidad:** activación expresa para futuros cierres, relación producto/receta del mismo restaurante y una venta por línea original. Guarda precio, descuento y coste estimado al cierre; los costes incompletos quedan pendientes. El informe QR está separado de las ventas manuales y se lee en una sola consulta. Los pedidos nuevos conservan el identificador de menú; su escandallo sigue pendiente.

La pantalla requiere **`cerrar_mesa_qr_con_reserva`**, incluso sin reserva elegida. Aplicar y verificar primero `harden-qr-close.sql`, después `connect-qr-reservation.sql`, `align-manual-consumption-points.sql`, `preserve-qr-menu-origin.sql` y `connect-qr-profitability.sql`, y solo entonces publicar la interfaz. Los seis SQL, incluido el ajuste opcional de plazas, siguen en `docs/sql`; no son migraciones aplicadas.

## Pruebas y límites

Última pasada local: **221 comprobaciones pasan** (23 Node, 17 plazas, 61 cierre QR, 45 enlace a reserva, 14 consumo manual, 22 origen de menús y 39 rentabilidad QR). Las comprobaciones del montaje del verificador de concurrencia no se incluyen en esa cifra.

- Pruebas Node: cuentas, paginación, Sala, candidatos de reserva, importes, petición pendiente y respuesta antigua.
- Pruebas SQL PGlite: plazas, permisos, cierre y consumo. Roles reales `anon`/`authenticated` sobre esquema ficticio, reversión completa, reintento idempotente, fidelización y consumo manual frente a QR.
- TypeScript, ESLint de archivos cambiados, revisión independiente y compilación Next.js con valores ficticios y sin claves reales.
- **26 carreras PostgreSQL 17.6 superadas** con dos escritores y observador de bloqueos en GitHub Actions, incluidas las cuatro nuevas de rentabilidad. [Evidencia del commit 03ba853](https://github.com/Joosee003/panel-restaurantes/actions/runs/34214087002/job/102021618240), 8 de septiembre de 2026, 10:11 UTC. También pasaron las 221 comprobaciones y el trabajo de calidad con lint, auditoría y compilación. El entorno local continúa sin admitir PostgreSQL con su usuario actual.
- La vista previa redirige al inicio de sesión de Vercel. No se ha pasado esa protección ni probado el recorrido autenticado.

PGlite 0.5.8 usa esquema reducido y una conexión. No prueba el esquema completo, todas las políticas/disparadores de producción ni escrituras simultáneas. Compilar tampoco demuestra el recorrido del usuario.

Comandos reproducibles con Node 24 y dependencias de pruebas fijadas:

```sh
npm ci --prefix tests/sql --ignore-scripts --no-audit --no-fund
node --test tests/*.test.mjs
GASTROHELP_SQL_TEST_ROOT=tests/sql node scripts/test-room-capacity.mjs
node scripts/test-qr-close-sql.mjs tests/sql/node_modules/@electric-sql/pglite/dist/index.js
node scripts/test-qr-reservation-sql.mjs tests/sql/node_modules/@electric-sql/pglite/dist/index.js
node scripts/test-manual-consumption-sql.mjs tests/sql/node_modules/@electric-sql/pglite/dist/index.js
node scripts/test-qr-menu-origin-sql.mjs tests/sql/node_modules/@electric-sql/pglite/dist/index.js
node scripts/test-qr-profitability-sql.mjs tests/sql/node_modules/@electric-sql/pglite/dist/index.js
node scripts/test-sql-concurrent.mjs --self-check
npx tsc --noEmit --incremental false
```

## Antes de publicar

1. Disponer de copia recuperable y probar su restauración.
2. Repetir en un entorno desechable autorizado con esquema completo los recorridos de [las 26 carreras ya superadas con datos ficticios](CONCURRENCY-VERIFICATION.md), incluido enlace QR frente a consumo manual, rentabilidad y dos llamadas con la misma operación.
3. Revisar esquemas expuestos, permisos privados y predeterminados. El SQL retira `PUBLIC EXECUTE` de funciones futuras del rol creador en todos los esquemas, no de las existentes. Revisar otros roles creadores.
4. Generar migraciones con la CLI tras validar los borradores. Instalar SQL antes de la interfaz y probar con dos sesiones de navegador, cambio de restaurante/fecha y desconexiones.
5. Activar plazas solo con inventario de Sala completo. No activar el piloto sin acordar alcance y accesos.

La consulta agregada de coherencia detectó un pedido abierto de demostración con cabecera de 96,40 € y líneas de 97,70 €. No se corrigió en producción. El nuevo cierre lo rechaza; no apareció ese descuadre en el otro pedido abierto leído.

## Fuera de este bloque

TheFork necesita acceso oficial y prueba. QR → rentabilidad necesita completar la relación real de productos/recetas, validar escandallos de menús y probar el recorrido completo antes de activar su registro. Correcciones, devoluciones, cuentas divididas y mesas combinadas requieren diseño y pruebas separados. Las reservas sin cliente asignado o intervalo comprobable no se enlazan desde esta pantalla; pueden cerrarse sin vinculación.

Falta comprobar el uso real de web, TPV, turnos y cobros con Hispanos Grill.

Detalles: [CONEXION-CIERRE-QR.md](CONEXION-CIERRE-QR.md), [ROOM-CAPACITY-CONNECTION.md](ROOM-CAPACITY-CONNECTION.md), [CONEXION-QR-RENTABILIDAD.md](CONEXION-QR-RENTABILIDAD.md).
