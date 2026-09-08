# Verificación con conexiones simultáneas

Estado a 8 de septiembre de 2026: **preparada, no ejecutada**.

`scripts/test-sql-concurrent.mjs` inicia un clúster PostgreSQL nuevo, crea datos
ficticios y usa dos conexiones con identificadores de proceso diferentes. Una
tercera conexión comprueba en `pg_stat_activity` que la operación está esperando
un bloqueo antes de liberar la primera transacción. Las pruebas de capacidad
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

## Casos preparados

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

## Límites que siguen abiertos

- El programa usa esquemas reducidos extraídos de las pruebas existentes. No
  sustituye una prueba con todos los disparadores, políticas y funciones reales.
- Las carreras se ejecutan con el propietario del clúster ficticio. Los permisos
  de `anon` y `authenticated` deben comprobarse por separado; PGlite contiene
  pruebas de esos roles, pero no demuestra la configuración RLS de producción.
- No cubre todavía el cierre vinculado a una reserva frente al registro manual
  de consumo, ni dos intentos simultáneos con el mismo identificador de operación.
- No comprueba navegador, desconexión del cliente, despliegue, cobro bancario,
  facturación ni recuperación de una copia de seguridad.

No dar por cerrada la autorización para publicar hasta ejecutar las carreras,
revisar el esquema completo y probar el recorrido de usuario correspondiente.

Referencia técnica: [bloqueos de PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html)
y [binarios locales de embedded-postgres](https://github.com/leinelissen/embedded-postgres).
