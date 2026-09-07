# Primer bloque de conexiones de servicios

7 de septiembre de 2026. Rama `codex/connect-restaurant-services`, basada en `b6ea46b`.

**Estado: cambios locales y SQL provisional probados por separado. No publicado ni aplicado a Supabase. No se ha activado el piloto de Hispanos Grill.**

## Preparado

1. **Sala:** lecturas completas con actualización por eventos, comprobación cada 45 segundos mientras la pestaña está visible y al volver a ella. Descarta respuestas de otra fecha/restaurante, conserva la selección y avisa si no consigue datos actuales. No convierte un error de lectura en mesas aparentemente libres.
2. **Plazas y reservas:** ajuste voluntario, apagado por defecto. El cupo queda limitado por las plazas de mesas activas, no bloqueadas y dentro de zonas activas. Se comprueba también al guardar una reserva, no solo al mostrar disponibilidad. No calcula combinaciones de mesas ni modifica cupos de TheFork.
3. **Cierre QR:** los pedidos se separan por restaurante, mesa y sesión. Se consultan los abiertos con paginación por identificador, aparte del historial. La cuenta se vuelve a leer antes de confirmar; el servidor preparado exige sesión, importe y lista completa bajo bloqueo. Registrar el pago no realiza ningún cargo ni emite factura.

La pantalla nueva de QR depende de `cerrar_mesa_qr_validada`. Si falta, rechaza el cierre: **no publicar esta interfaz antes de instalar y verificar el SQL correspondiente**.

## Comprobaciones

- 13 pruebas de lógica local: identidad y cuentas QR, importes, paginación y solicitudes de Sala.
- 17 comprobaciones SQL de plazas en PostgreSQL local con datos ficticios.
- 28 comprobaciones SQL de cierre QR, incluyendo roles y reversión del cambio ante permisos inesperados.
- TypeScript y ESLint de los archivos cambiados; compilación de Next.js con configuración ficticia, sin claves reales.

Las pruebas SQL usan PGlite 0.5.8 y un esquema reducido. No prueban el esquema completo, todos los disparadores reales, dos conexiones simultáneas ni el recorrido completo en navegador. No son prueba de que los cambios estén operativos en producción.

Para repetirlas, con Node 24 y las dependencias del proyecto instaladas:

```sh
node --test tests/*.test.mjs
npm install --prefix /tmp/gastrohelp-sql-tests --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
GASTROHELP_SQL_TEST_ROOT=/tmp/gastrohelp-sql-tests node scripts/test-room-capacity.mjs
node scripts/test-qr-close-sql.mjs /tmp/gastrohelp-sql-tests/node_modules/@electric-sql/pglite/dist/index.js
npx tsc --noEmit --incremental false
```

## Pendiente antes de publicar

- Copia recuperable y prueba de restauración; no se dispone todavía de esa comprobación.
- Entorno PostgreSQL desechable con esquema completo y dos conexiones para probar las carreras entre reservas/bloqueos y pedidos/cierres. PGlite no cubre esa prueba.
- Convertir ambos borradores de `docs/sql` a migraciones mediante la CLI. La ejecución de la CLI quedó bloqueada; no se han inventado ni registrado migraciones.
- Revisar las restricciones posteriores al cierre y el permiso del módulo QR en el servidor. El SQL de permisos privados también cambia los permisos predeterminados de funciones futuras del creador; revisar otros roles creadores antes de aplicarlo.
- Probar navegador con dos sesiones y cambio de restaurante/fecha, errores de conexión, lista completa, importe cambiado y respuesta de cierre perdida.
- Instalar SQL antes de la interfaz dependiente; confirmar el resultado y solo entonces activar el ajuste de plazas en un restaurante cuyo inventario de Sala esté completo.

## Todavía no conectado

El cierre QR aún no registra automáticamente reserva, visita, gasto, puntos o ventas de rentabilidad. El contrato y sus restricciones están en [CONEXION-CIERRE-QR.md](CONEXION-CIERRE-QR.md): elección expresa de la reserva, operación única y protección frente a registros manuales duplicados. No unir clientes o platos por parecido de nombre.

TheFork sigue pendiente de acceso oficial y prueba. También falta recoger el uso real de web, TPV, mesas, cocina y cobros de Hispanos Grill. No se han enviado mensajes a Michel ni modificado sus condiciones comerciales.

Detalles de plazas: [ROOM-CAPACITY-CONNECTION.md](ROOM-CAPACITY-CONNECTION.md).
