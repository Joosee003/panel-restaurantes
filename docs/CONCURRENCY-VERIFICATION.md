# Verificación con conexiones simultáneas

Estado a 8 de septiembre de 2026: **26 carreras reales superadas en PostgreSQL 17.6 con datos ficticios**.

Incluyen cuatro casos de rentabilidad QR: reintento simultáneo y desactivación
antes/después de confirmar o revertir.

Evidencia: [trabajo SQL terminado correctamente](https://github.com/Joosee003/panel-restaurantes/actions/runs/34214087002/job/102021618240)
del commit `03ba853fcacc83d219b5fceccb8739f8a8a04a12`, a las 10:11 UTC.
También pasaron las 221 comprobaciones de una conexión/Node y el trabajo de
calidad con lint, auditoría de dependencias y compilación. Esto **no acredita el
esquema completo de Supabase ni el recorrido con navegador**.

`scripts/test-sql-concurrent.mjs` inicia un clúster PostgreSQL nuevo, crea datos
ficticios y usa dos conexiones con identificadores de proceso diferentes. Una
tercera conexión comprueba en `pg_stat_activity` y `pg_blocking_pids` que la
operación espera un bloqueo de la primera conexión antes de liberarlo. Las pruebas de capacidad
comprueban además el rechazo inmediato `CAPACITY_BUSY` y el resultado del
reintento después del `COMMIT`.

Las cuentas QR ficticias contienen líneas cuyo precio por cantidad coincide
con el total guardado. El pedido competidor crea cabecera y línea en la misma
operación para no confundir una carrera con un pedido incompleto.

## Bloqueo observado

Se instalaron en un directorio temporal, con versiones fijadas:

- PostgreSQL 17.6 mediante `@embedded-postgres/linux-x64@17.6.0-beta.15`.
- `pg@8.23.0`.
- `@electric-sql/pglite@0.5.8`, disponible para las pruebas de una conexión.

El binario confirmó `postgres (PostgreSQL) 17.6`. No pudo iniciarse un clúster:
la sesión tiene usuario `root`, PostgreSQL no admite ese usuario y el entorno
rechazó el cambio al usuario existente `nobody` con
`cannot set groups: Operation not permitted`. No se intentó otro mecanismo
para superar esa restricción ni se creó un proyecto remoto.

La comprobación de sintaxis de Node y `--self-check` sí pasaron. Este último sólo
comprueba que se pueden leer los esquemas ficticios y las funciones base; **no
prueba transacciones, bloqueos ni conexiones simultáneas**. El modo real devuelve
código 2 cuando se inicia como `root`.

## Ejecución en GitHub Actions

El trabajo `SQL fixtures and concurrent QR operations` de
`.github/workflows/quality.yml` usa el usuario ordinario del ejecutor
`ubuntu-24.04`. Instala únicamente las dependencias de `tests/sql` con su
`package-lock.json`: PGlite 0.5.8, pg 8.23.0 y PostgreSQL 17.6 empaquetado.
La instalación desactiva scripts automáticos; un paso explícito restaura los
enlaces de las bibliotecas del paquete PostgreSQL, revisado para esta prueba.

El trabajo tiene permiso de lectura del repositorio, no conserva credenciales
de checkout y no recibe claves ni URL de Supabase. Primero ejecuta las pruebas
Node y SQL de una conexión, después las carreras reales. Su límite es diez
minutos. No despliega ni aplica cambios a otras bases.

El resultado de `--self-check` y una ejecución pendiente no cuentan como
concurrencia verificada. La ejecución enlazada terminó con
`26 REAL two-connection race checks passed`. Sus conexiones fueron:

| Grupo | Escritor A | Escritor B | Observador |
| --- | --- | --- | --- |
| Plazas | 2332 | 2333 | 2334 |
| Cuenta QR | 2336 | 2337 | 2338 |
| QR vinculado a reserva y rentabilidad | 2340 | 2341 | 2342 |

Los avisos de conexión terminada al detener el clúster corresponden al apagado
del servidor ficticio después de completar las pruebas; el trabajo terminó con éxito.

## Cómo ejecutarla en un entorno autorizado

Requisitos: usuario local no root, binarios PostgreSQL 17 y Node con el paquete
`pg` instalado. No se necesita una URL ni una clave de Supabase.

```sh
node scripts/test-sql-concurrent.mjs --self-check
node scripts/test-sql-concurrent.mjs /ruta/postgresql/bin /ruta/node_modules/pg
```

Si se usan los binarios empaquetados de `@embedded-postgres`, deben estar
instalados sus enlaces de bibliotecas siguiendo las instrucciones del paquete.
La prueba no instala paquetes ni cambia usuarios o permisos del sistema.

El programa crea su propio directorio temporal, desactiva TCP y usa un socket
Unix privado. No acepta `DATABASE_URL`, `PGHOST` ni otra base existente. Al acabar
detiene el servidor y conserva ese directorio ficticio para revisar un fallo.
No modifica producción ni otras bases locales. La salida sólo puede anunciar
`REAL two-connection race checks passed` cuando todas las carreras han pasado.

## Casos superados en el esquema ficticio

| Carrera | Resultado exigido |
| --- | --- |
| Reserva frente a otra reserva | Segunda operación ocupada; al reintentar, no sobrepasar las plazas. |
| Bloqueo de mesa antes de reservar | Rechazar la reserva con disponibilidad antigua. |
| Reserva aceptada antes de bloquear la mesa | Conservar la reserva y rechazar nueva demanda que no cabe. |
| Reserva con límite desactivado frente a activación | Serializar la activación y conservar reservas ya aceptadas. |
| Activación antes de una reserva demasiado grande | Rechazar esa nueva reserva. |
| Pedido nuevo antes del cierre QR | Rechazar el presupuesto antiguo del cierre. |
| Cierre antes de insertar con la sesión antigua | Rechazar el pedido de la sesión cerrada. |
| Dos cierres de la misma cuenta | Crear un solo registro de cierre. |
| Cancelación en cocina antes del cierre | Rechazar el presupuesto antiguo. |
| Cierre antes de una actualización de cocina | No modificar el pedido cobrado. |
| Desactivación del módulo antes del cierre | Rechazar el registro de pago. |
| Cierre antes de desactivar el módulo | Terminar el cierre antes de la desactivación. |
| Consumo manual antes del cierre vinculado | Tras confirmar, rechazar el cierre sin otra visita ni puntos. |
| Cierre vinculado antes del consumo manual | Tras confirmar, indicar consumo registrado sin duplicar. |
| Consumo manual que revierte mientras espera el cierre | Permitir el cierre con una sola visita y movimiento de puntos. |
| Cierre que revierte mientras espera el consumo manual | Permitir el consumo manual sin dejar cuenta cerrada. |
| Mismo identificador, primera llamada sin confirmar | Indicar operación ocupada; tras confirmar, recuperar la misma respuesta. |
| Mismo identificador, primera llamada revertida | El reintento puede completar la operación una sola vez. |
| Dos identificadores diferentes para la misma reserva | Conservar un solo cierre y rechazar el segundo tras confirmar. |
| Dos identificadores, primer cierre revertido | Completar el segundo sin registros del primero. |
| Mismo identificador con datos de pago distintos | Rechazar tras confirmar el original, sin alterar su resultado. |
| Cliente bloqueado por otra operación | Rechazar por ocupado, sin efectos, y permitir repetir tras liberar. |
| Reintento simultáneo de cierre con rentabilidad | Conservar una venta por línea y recuperar el mismo cierre. |
| Cierre antes de desactivar captura de ventas | La desactivación espera la confirmación y conserva las ventas guardadas. |
| Cierre revertido mientras espera la desactivación | No dejar ventas/visitas/puntos parciales y respetar la desactivación al reintentar. |
| Desactivación antes de un cierre en espera | El cierre termina sin registrar ventas con una activación antigua. |

## Límites que siguen abiertos

- El programa usa esquemas reducidos extraídos de las pruebas existentes. No
  sustituye una prueba con todos los disparadores, políticas y funciones reales.
- Los esquemas, la identidad y el acceso a restaurantes son ficticios. Las
  comprobaciones de roles no demuestran la configuración RLS de producción.
- El grupo vinculado reproduce el envoltorio privado de consumo manual leído
  del catálogo el 8 de septiembre de 2026. No sustituye comprobar la cadena
  completa de permisos del proyecto real.
- No comprueba navegador, desconexión del cliente, despliegue, cobro bancario,
  facturación ni recuperación de una copia de seguridad.

La aprobación para publicar sigue pendiente de revisar el esquema completo,
la restauración y el recorrido de usuario correspondiente.

Referencia técnica: [bloqueos de PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html)
y [binarios locales de embedded-postgres](https://github.com/leinelissen/embedded-postgres).
