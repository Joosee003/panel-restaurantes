# Pedidos QR y rentabilidad

8 de septiembre de 2026. **Borrador de PR #39. No instalado en producción.**

## Recorrido

En Rentabilidad se relaciona cada producto de la carta con una receta del mismo
restaurante y se activa expresamente el registro de futuras ventas QR. La opción
empieza apagada. No se buscan coincidencias por nombre ni se importan cuentas
anteriores automáticamente.

Al cerrar la cuenta se guarda una fila por línea del pedido, en la misma
transacción que el cierre, la reserva, la visita y los puntos. Su clave es el
identificador original de esa línea; repetir la operación no crea otra venta.
Un fallo posterior revierte también estas filas.

Cada fila conserva nombre, cantidad, precio realmente registrado en el pedido,
descuento, ingreso sin propina, receta relacionada y coste observado al cerrar.
La suma de descuentos coincide al céntimo con el descuento de la cuenta. Se
reparte proporcionalmente por importe, distribuyendo los céntimos restantes de
forma estable por identificador de línea. Una cuenta con descuento del 100 %
mantiene su coste aunque el ingreso sea cero.

El coste usa la compra, cantidad aprovechable tras merma y cantidad de receta.
Se suma antes de redondear el total de la línea. Cambiar precios o recetas no
modifica las ventas ya registradas. Borrar una receta tampoco las elimina. El
borrado de un producto usado en un pedido finalizado sigue bloqueado por la
referencia del pedido; puede desactivarse para retirarlo de la carta.

## Datos incompletos y menús

| Estado | Resultado |
| --- | --- |
| Producto relacionado y receta completa | Coste estimado al cierre y diferencia frente al ingreso |
| Producto sin relación | Ingreso guardado; coste y diferencia sin calcular |
| Receta vacía, ingrediente ajeno/inactivo o cifras inválidas | Ingreso guardado; coste y diferencia sin calcular |
| Menú con identificador | Origen conservado; coste pendiente de escandallo de menú |
| Pedido antiguo sin identificador | Origen desconocido, sin deducción por nombre |

`preserve-qr-menu-origin.sql` conserva `menu_id` al crear pedidos nuevos con el
RPC existente. Mantiene su comprobación de token, carta, mesa y disponibilidad.
El identificador histórico permanece aunque se borre el menú de la carta.

No se calculan los menús como si fueran un plato individual: faltan escandallos
de menú y elección de componentes. Las ventas anteriores que perdieron su
identificador no pueden reconstruirse con certeza.

## Pantallas y protección

Las ventas QR se muestran en un bloque propio de Rentabilidad y Ventas. Las
ventas manuales existentes siguen aparte; no se suman ambos registros sin
comprobar si una misma venta se introdujo también a mano. No hay botón de
borrado de ventas QR y el servidor rechaza su modificación y borrado.

El informe mensual se obtiene con una sola consulta para no omitir ventas que
se confirmen mientras se cargan distintas páginas. Envía importes como texto
decimal exacto. Si el mes supera 30.000 líneas, muestra el límite y no presenta
un total parcial; hará falta ampliar el informe antes de operar a ese volumen.

Cuando falta algún coste, el bloque no presenta una diferencia global completa
como si esos costes fueran cero. Los importes son los registrados en el pedido:
no se normaliza el IVA por producto ni se incluyen personal, alquiler u otros
gastos. **Es una comparación con ingredientes, no beneficio neto ni contabilidad
fiscal.**

Los módulos QR y Rentabilidad deben estar activos para configurar la conexión.
La captura requiere ambos y la activación expresa. Desactivarla detiene futuras
capturas; no borra ventas ni carga automáticamente el periodo desactivado.
Las lecturas requieren usuario autorizado para ese restaurante y módulo de
Rentabilidad activo. Las tablas tienen RLS y solo permiso SELECT para usuarios;
los cambios de configuración pasan por funciones que comprueban acceso y modo
demostración. La captura no está expuesta como una operación manual de la API.

## Instalación y validación pendiente

Orden del borrador completo: `harden-qr-close.sql`,
`connect-qr-reservation.sql`, `align-manual-consumption-points.sql`,
`preserve-qr-menu-origin.sql` y `connect-qr-profitability.sql`.
El ajuste opcional de plazas sigue siendo independiente.

Antes de generar/aplicar migraciones: copia y restauración verificadas, entorno
desechable autorizado con esquema completo, revisión de permisos e índices,
prueba de la creación anónima por token, cierre con dos sesiones y lectura
autenticada del panel. `app_private` debe mantenerse fuera de los esquemas
expuestos. El cierre de una cuenta no ejecuta un cargo bancario ni una factura.

Pruebas reproducibles añadidas: **22 de origen de menús y 39 de rentabilidad
superadas** con `scripts/test-qr-menu-origin-sql.mjs` y
`scripts/test-qr-profitability-sql.mjs`. TypeScript y ESLint focal también pasan.
El verificador `scripts/test-sql-concurrent.mjs` añade cuatro carreras reales
(26 en total); su montaje pasa localmente, con ejecución real nueva pendiente
de CI. Las pruebas con esquema ficticio no acreditan el recorrido de navegador
ni todos los disparadores/políticas de producción.

Referencias: [funciones y permisos de Supabase](https://supabase.com/docs/guides/database/functions),
[exposición explícita de tablas](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically),
[restricciones de PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-constraints.html).
