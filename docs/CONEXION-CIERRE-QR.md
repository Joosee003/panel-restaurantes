# Cierre QR conectado a reserva y cliente

8 de septiembre de 2026. Implementación en borrador, **no instalada en producción**. No realiza cargos, facturas, mensajes externos ni altas de marketing.

## Recorrido preparado

El empleado revisa la cuenta completa, busca reservas de esa mesa y elige una expresamente, o deja «Sin reserva vinculada». Confirma que el dinero ya se recibió. Una llamada guarda el cierre y, con reserva válida, consumo, visita y puntos. Un error revierte todo, incluido el cambio de sesión QR.

Requisitos para vincular:

- Módulos QR, reservas y clientes activos; usuario autorizado, no demostración.
- Misma mesa/restaurante; reserva pendiente o confirmada; cliente ya asignado del mismo restaurante. No se busca por nombre, teléfono o correo.
- Hora actual y todos los pedidos dentro del servicio, extremo final exclusivo. El servidor interpreta reservas antiguas con su zona horaria; la pantalla propone solo intervalos explícitos `inicio_at`/`fin_at`.
- Ningún consumo/visita anterior ni movimiento de puntos huérfano. No se sobreescribe un consumo manual.
- Consumo = productos − descuento, sin propina. De 0 a 10.000 € para el enlace; una cuenta gratuita registra visita sin puntos. Sin vinculación se permiten importes superiores válidos.

La cuenta se atribuye al titular elegido, no a cada comensal. El trigger existente de historial es el único que añade puntos, respetando módulo y ajustes; se lee el movimiento realmente guardado. No se crean clientes ni cambian consentimientos. La notificación es interna.

## Contrato y orden de instalación

Primero `harden-qr-close.sql`, después `connect-qr-reservation.sql` y
`align-manual-consumption-points.sql`, tras cumplir los requisitos de publicación.
Este último corrige el consumo manual para leer los puntos reales, validar el
restaurante del cliente y no conceder permisos de marketing al crear su ficha.

```text
cerrar_mesa_qr_con_reserva(
  p_operacion_id uuid,
  p_mesa_id uuid,
  p_pedidos_ids uuid[],
  p_mesa_session_id uuid,
  p_total_esperado numeric,  // bruto de productos sin descuento ni propina
  p_descuento numeric = 0,
  p_propina numeric = 0,
  p_metodo_pago text = 'tarjeta',
  p_notas text = null,
  p_reserva_id uuid = null
)
```

Devuelve `ok`, `cierre_id`, `total_cobrado`, `nueva_url_generada`, `expires_at`, `operacion_id`, `reserva_id`, `cliente_id`, `consumo_total`, `puntos_generados` y `replayed`. La misma operación/contenido devuelve el resultado anterior; con otro contenido se rechaza.

La tabla privada tiene unicidad de operación, mesa/sesión, cierre, reserva e historial. No permite acceso de `anon` ni `authenticated`. La función pública es `SECURITY INVOKER`; la privada comprueba identidad/acceso antes de consultar respuestas. `app_private` debe permanecer fuera de los esquemas de la API. El SQL comprueba dependencias antes de instalarse.

## Protección y recuperación

- Creación y cierre toman bloqueo de mesa; el cierre bloquea pedidos y las escrituras de líneas bloquean su pedido. Se comprueban sesión, lista e importe. Una suma de líneas distinta del total se rechaza sin sustituir el importe confirmado.
- Módulo QR activo obligatorio en el servidor. Cuentas y líneas cobradas/canceladas no se reabren, editan ni borran mediante una pantalla antigua.
- La API no puede fabricar cierres ni marcar directamente pedidos cobrados. El control usa el rol SQL, no una variable que se pueda falsificar.
- Solo se conserva el refresco de fechas de los cuatro pedidos ficticios de demostración desde su función propietaria; no cambia su contenido.
- El consumo vinculado y su historial no se borran ni reinician para introducir otro consumo. Notas operativas editables. Ajustes económicos/devoluciones siguen pendientes de un proceso propio.
- El navegador valida antes de guardar la petición en `sessionStorage`. No contiene nombres, teléfonos ni credenciales. Dura la pestaña; la garantía definitiva reside en la base de datos.
- «Comprobar cierre pendiente» usa identificador y contenido originales aunque la cuenta ya no aparezca abierta. No recalcula ni cobra. Una respuesta antigua no borra una operación posterior.
- Rechazo explícito del primer intento permite retirar el pendiente. Un rechazo de un reintento, cambio de permisos o respuesta desconocida **no prueba que el primer intento no se guardó**: se conserva para revisión. Un registro local dañado bloquea nuevos cierres, sin descartarse en silencio.

## Pruebas y límites

Node comprueba identidad, importes, candidatos, paginación y recuperación. SQL PGlite 0.5.8 con datos ficticios comprueba roles, permisos, módulos, estados finales, escritura anónima autorizada de cabecera/líneas/total, demostración, sesión, coherencia monetaria, enlace único, consumo manual anterior/posterior, fidelización y reversión completa.

El esquema ficticio incluye el trigger actual de puntos y la función manual; **no sustituye el esquema completo ni las pruebas simultáneas**. La simulación anónima reproduce escrituras, no todas las validaciones reales de QR, token, carta o menú.

Pendientes: copia/restauración, entorno desechable con esquema completo y navegador autenticado. Ver [CONCURRENCY-VERIFICATION.md](CONCURRENCY-VERIFICATION.md): 22 carreras reales superadas en PostgreSQL 17.6 mediante GitHub Actions, con esquema ficticio. Debe repetirse el recorrido con todos los disparadores y permisos reales. Los conflictos exigen repetir la misma operación, no deducir éxito.

## Rentabilidad preparada en el borrador

La conexión opcional de [QR y rentabilidad](CONEXION-QR-RENTABILIDAD.md) añade una relación expresa entre `carta_productos` y `platos` del mismo restaurante. Al cerrar guarda una venta por línea original, precio registrado, reparto exacto de descuentos y coste de receta observado al cierre. Sin coste o relación, el margen queda pendiente. Los menús nuevos conservan `menu_id`; su escandallo sigue pendiente. La activación empieza apagada y solo afecta a cierres posteriores. Ambos SQL adicionales permanecen sin instalar.

Tampoco quedan resueltos cuentas divididas, varios pagadores, mesas combinadas, devoluciones, TheFork ni pruebas con Hispanos Grill. «Mixto» solo anota un método, no el reparto entre pagadores.

Fuentes: código del proyecto y catálogo de Supabase; [funciones/permisos](https://supabase.com/docs/guides/database/functions), [permisos predeterminados](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html).
