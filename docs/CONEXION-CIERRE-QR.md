# Cierre QR y conexión con los demás servicios

Estado: preparación local, 7 de septiembre de 2026. No aplicado a producción. No se ha activado el piloto ni se han enviado mensajes o realizado cobros.

## Qué hace hoy

La ruta de cierre revisada guarda `cierres_mesa_qr`, marca los pedidos como cobrados y cambia el acceso/sesión QR de la mesa. Registrar «tarjeta», «efectivo», «Bizum» o «mixto» **no ejecuta un pago**.

La función de cierre no escribe una reserva, visita, gasto de cliente, puntos ni venta de rentabilidad. Se revisaron sus definiciones y los disparadores de las tablas afectadas mediante consultas de catálogo, sin leer filas de clientes. No se ha confirmado ningún consumidor externo que haga estas conexiones por su cuenta.

## Primer bloque: asegurar el cierre existente

Preparado en `docs/sql/harden-qr-close.sql`, todavía fuera de las migraciones:

- Crear un pedido y cerrar una mesa toman el mismo bloqueo de mesa. El disparador de inserción comprueba de nuevo restaurante y sesión después del bloqueo, conservando los límites existentes. Un pedido que traiga una sesión anterior se rechaza.
- El cierre exige exactamente todos los pedidos abiertos de la sesión actual. No acepta una parte, identificadores repetidos, nulos, cancelados ni otra mesa/restaurante.
- Las filas de pedidos se bloquean durante el cálculo y la escritura. Si cambió la cuenta desde lo que confirmó el empleado, no se registra el cierre.
- Importes finitos, no negativos, con precisión de céntimos; descuento no superior al bruto; métodos de pago reconocidos.
- Se conserva la firma antigua para los clientes ya publicados. La interfaz nueva utiliza la llamada validada y no debe recurrir a la antigua si falta la nueva.
- El nuevo acceso público es `SECURITY INVOKER`; el código con privilegios está en `app_private`, comprueba usuario, restaurante y bloqueo de demostración. Solo `authenticated` tiene permiso de ejecución. `app_private` debe seguir fuera de los esquemas de la API.
- Antes de dar `USAGE` sobre `app_private`, una comprobación de catálogo aborta si cualquier otra función con privilegios puede ejecutarse como `authenticated`, también por `PUBLIC` o un rol heredado. Todo el archivo va dentro de una transacción: ese rechazo deshace también las funciones y permisos anteriores.
- Se retira `EXECUTE` por defecto para `PUBLIC` en las funciones futuras del rol que aplique el SQL. PostgreSQL no permite retirar ese permiso implícito solo en un esquema: afecta a las nuevas funciones de ese creador en todos los esquemas, que necesitarán permisos explícitos. No cambia funciones existentes. Hay que revisar por separado otros roles creadores y sus permisos predeterminados antes de publicar.

Contrato de la llamada nueva:

```text
cerrar_mesa_qr_validada(
  p_mesa_id uuid,
  p_pedidos_ids uuid[],
  p_mesa_session_id uuid,
  p_total_esperado numeric,  // bruto de productos; NO incluye descuento ni propina
  p_descuento numeric,
  p_propina numeric,
  p_metodo_pago text,
  p_notas text
)
```

La respuesta correcta conserva `ok`, `cierre_id`, `total_cobrado`, `nueva_url_generada` y `expires_at`. Una respuesta perdida no autoriza a repetir el cierre: primero hay que comprobar el historial. El segundo intento con la sesión anterior se rechaza, no registra otro cierre.

Errores que requieren recargar y volver a confirmar: `SESION_MESA_CAMBIADA`, `PEDIDOS_CAMBIADOS_ACTUALIZA`, `IMPORTE_CAMBIADO_ACTUALIZA`. Los demás errores de autorización o importes no deben transformarse en éxito.

### Comprobaciones realizadas y límites

`scripts/test-qr-close-sql.mjs` ejecuta el SQL preparado en PostgreSQL local mediante PGlite 0.5.8, con datos ficticios y sin conexión a Supabase. Pasaron 28 comprobaciones: conjunto parcial/duplicado/nulo/cancelado, sesión o precio antiguos, importes inválidos, usuario desconocido, restaurante ajeno, modo demostración, rechazo real con rol `anon`, delegación con rol `authenticated`, cierre único, inserción con sesión caducada y límite de frecuencia. También comprueba la falta de permiso implícito en futuras funciones y el rechazo con reversión de todos los cambios ante funciones ajenas ejecutables por `PUBLIC` o por un rol heredado.

```sh
node scripts/test-qr-close-sql.mjs /ruta/a/@electric-sql/pglite/dist/index.js
```

Las pruebas usan una función local de bytes ficticios; no prueban la calidad del generador criptográfico. PGlite aquí usa una conexión: **no acredita las carreras de dos conexiones simultáneas**. Antes de publicar se necesita:

1. Revisar el SQL con el esquema completo, sus permisos y disparadores. Confirmar que el disparador `pedidos_qr_enforce_session_limits` existe y está habilitado antes de aplicar el reemplazo de su función.
2. Probar dos sesiones PostgreSQL: alta de pedido frente a cierre, dos cierres, cancelación desde cocina frente a cierre y recepción de un pedido tras esperar un bloqueo.
3. Revisar cambios directos de `estado` o `total`: una pantalla de cocina antigua no debe reabrir, cancelar ni editar una cuenta ya cerrada. El cierre bloquea filas durante su transacción, pero no sustituye las restricciones de las escrituras posteriores.
4. Revisar el permiso del módulo QR en el servidor. El endurecimiento mantiene el control por restaurante existente, pero **no añade la comprobación de contratación/activación del módulo**.
5. Probar la interfaz completa, datos reales de esquema en un entorno desechable autorizado y copia/restauración comprobada. Después crear la migración con la CLI; publicar SQL antes de la interfaz dependiente. No publicar solamente el frontend.

## Segundo bloque: una reserva y una cuenta completas

La primera conexión funcional debe ser deliberadamente limitada: **una sesión de mesa, una cuenta completa y una reserva elegida expresamente por el empleado**. Sin deducir automáticamente el cliente por hora, nombre, teléfono o mesa.

Interfaz propuesta:

- Mostrar la sesión QR, cuenta y reservas candidatas del mismo restaurante/mesa. El empleado confirma cuál corresponde; si no hay una, dejar «sin reserva vinculada».
- Mostrar el titular al que se asignaría el gasto y aclarar que sería el gasto de la cuenta, no el consumo individual de todos los comensales.
- Si la reserva ya tiene un consumo registrado manualmente, detener la vinculación y mostrar una revisión. No sumar otra visita ni sobrescribir el importe.
- Cuentas divididas, varias sesiones para una reserva, varios pagadores y mesas combinadas quedan fuera de ese primer paso, con aviso claro. «Mixto» es solo el método anotado: no existe aún reparto detallado de importes por pagador.

Servidor propuesto: una única transacción que valide y bloquee mesa, pedidos y reserva en un orden documentado; guarde el cierre y su referencia única a la reserva; registre la visita/consumo; y cambie la sesión. No encadenar dos llamadas desde el navegador: si la segunda falla quedarían estados distintos.

Condiciones necesarias:

- Referencias persistentes de cierre/sesión/reserva; restricciones de restaurante coherentes y claves únicas para impedir dos cierres asociados a la misma visita.
- Reintento con la misma clave devuelve el resultado anterior solo si coincide todo el contenido; clave repetida con otro importe debe fallar. Diseñar correcciones y devoluciones como movimientos trazables, no borrados de consumo.
- La función actual de consumo rechaza gasto cero y superior a 10.000. Una cuenta gratuita/descuento total o superior a ese importe necesita un tratamiento explícito; no puede impedir registrar correctamente el cobro ya recibido.
- Un `ok: false / CONSUMO_YA_REGISTRADO` no es éxito. Debe detener toda la nueva transacción o producir una reconciliación expresamente definida; nunca cerrar por un lado y duplicar gasto por otro.
- Validar estado de la reserva, fecha/turno y mesa. Una reserva cancelada o de no asistencia no se convierte silenciosamente en visita por un cierre QR.
- Separar bruto, descuento, consumo neto y propina. Propuesta conservadora: el consumo/puntos toma productos menos descuento, sin propina; pendiente de fijar y probar la regla de fidelización. No atribuir el gasto de cada miembro del grupo sin identificación y acuerdo.

## Tercer bloque: puntos, mensajes y rentabilidad

**Puntos:** reutilizar la regla existente solo después de confirmar que no se duplican el disparador de historial y el registro explícito. Solo con módulo de fidelización y puntos activos. Debe quedar una referencia estable al cierre/visita y una devolución exacta en caso de corrección. No inscribir a un invitado en un programa ni crear un cliente de marketing por haber pedido desde el QR.

**Permisos de contacto:** la función de consumo actual intenta insertar `permite_whatsapp/email = true` al crear un cliente, pero un disparador de producción vuelve a calcular esos campos desde consentimientos activos por finalidad. Mantener esa protección y cambiar futuros insertos a valores falsos explícitos. La notificación interna de visita/puntos no debe disparar por sí sola un mensaje promocional. Un teléfono de reserva no constituye permiso para reseñas o fidelización.

**Rentabilidad:** `carta_productos` y `platos` son catálogos distintos y hoy no tienen una referencia entre ellos. Las ventas manuales tampoco llevan una clave de origen QR que evite duplicados. Hace falta:

- Mapa explícito producto QR → plato de rentabilidad del mismo restaurante. Nunca unir por nombre parecido.
- Guardar origen de cada línea y una clave única (`pedido_qr_item_id` o equivalente), cantidades y coste en el momento de la venta. No volver a añadir manualmente la misma venta.
- Repartir el descuento de cuenta entre líneas con ajuste exacto de céntimos; propinas separadas. No presentar impuestos, costes faltantes o ventas no registradas como margen neto real.
- Tratar productos sin mapa y costes pendientes como «sin calcular», no coste cero/margen completo.
- Los menús del día se aceptan con un identificador `menu-...`, pero el pedido actual persiste `producto_id = null` y no conserva `menu_id`. Hay que guardar esa identidad y definir su receta o componentes antes de calcular su margen.

## Qué sigue pendiente de confirmar con Hispanos Grill

- Uso real de TheFork, su web, TPV, turnos, mesas combinadas, cocina, cobros y trabajo sin conexión.
- Qué cuenta corresponde al titular de una reserva; gestión de invitados, división de cuentas, propinas, premios y correcciones.
- Acceso oficial para TheFork: no está concedido ni probado; no se sustituye con extracción de pantalla o credenciales compartidas.
- Alcance y fechas del piloto completo por fases, costes externos y tratamiento de sus 30 €/mes de reputación. No se han cambiado esas condiciones.

Fuentes técnicas consultadas el 7 de septiembre de 2026: código local de `pedidos-qr`, migraciones de consumo/fidelización y consultas de catálogo de Supabase (sin filas de negocio); [funciones y permisos de Supabase](https://supabase.com/docs/guides/database/functions), [permisos predeterminados de PostgreSQL](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html). No se ha ejecutado ningún cierre ni insertado pedidos en producción.
