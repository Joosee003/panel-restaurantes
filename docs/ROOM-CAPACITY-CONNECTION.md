# Sala y plazas reservables: cambio local pendiente de publicación

## Alcance

El borrador `docs/sql/connect-room-capacity.sql` añade el ajuste explícito
`reservas_config.capacidad_vinculada_sala`, desactivado por defecto. No se ha
aplicado a producción ni se ha cambiado la configuración de ningún restaurante.

Con el ajuste activo, el límite de cada franja es el menor de:

- Su cupo configurado, incluidas las excepciones del día.
- La suma de plazas de mesas activas, no bloqueadas y en zonas activas del mismo
  restaurante. Las mesas sin zona no cuentan, igual que en la vista actual de Sala.

A ese límite se restan los comensales de reservas que ocupan el intervalo.
Las consultas pública, manual y chatbot usan el mismo cálculo físico, conservando
sus reglas previas de acceso, horarios y antelación. No hay reserva nueva posible
si el ajuste está activo y no quedan mesas válidas.

Si el cupo comercial es menor que las plazas físicas libres, bloquear una mesa
puede no cambiar el cupo hasta que las plazas físicas queden por debajo de él.
No se cambia ni se resta de forma permanente el cupo guardado.

Esto NO asigna mesas automáticamente, NO decide qué mesas pueden juntarse y NO
garantiza que cada grupo quepa en una mesa concreta. Esa comprobación continúa
al asignar mesa. Tampoco cambia cupos en TheFork u otra plataforma externa.

## Seguridad y consistencia

- Activar el ajuste requiere confirmar primero el inventario completo de Sala.
- El control en Ajustes solo aparece si la columna existe. Si no existe, el
  formulario muestra que la conexión está pendiente y omite esa clave al guardar.
- Clientes antiguos que no envían la clave conservan el valor ya guardado.
- Una validación final en la escritura de reservas comprueba las plazas físicas
  otra vez. Protege frente a una consulta de disponibilidad realizada antes de
  bloquear una mesa y frente a cambios de fecha o comensales.
- Se conservan los cerrojos por restaurante/día de los RPC de creación y cambio.
  Un cerrojo adicional por restaurante coordina la escritura final y los cambios
  de mesas, zonas y configuración. No espera si otra transacción lo tiene: devuelve
  `CAPACITY_BUSY` (SQLSTATE `55P03`) para evitar un bloqueo circular entre filas.
- Web/chatbot/cambio público responden 503 con `Retry-After: 2`; los formularios
  conservan los datos y explican el reintento. No se añaden reintentos automáticos.
  El reintento manual de alta conserva su clave de idempotencia existente.
- El cerrojo también protege la transición desde el modo apagado. Por ello un
  cambio simultáneo de configuración puede provocar un rechazo temporal incluso
  antes de activarlo; no se acepta una escritura a partir de datos antiguos.
- Bloquear mesas no cancela reservas aceptadas ni registra visitas o cobros. Si
  las reservas existentes superan el nuevo límite, las nuevas quedan bloqueadas;
  las llegadas y la reducción de comensales de reservas existentes siguen posibles.
  El responsable debe revisar/reubicar las reservas afectadas antes de confirmar
  un bloqueo físico. Este parche no incluye un aviso específico de exceso en Sala.
- Los auxiliares están en `app_private`, con permisos directos retirados a los
  roles API. Los tres lectores existentes siguen siendo `SECURITY DEFINER` y
  conservan sus controles de acceso y permisos.
- El borrador detiene la instalación si no reconoce exactamente las definiciones
  existentes que adapta. No aplica una modificación parcial de los tres canales.

## Pruebas locales

Se usa PostgreSQL en memoria con PGlite; no se lee ninguna URL ni credencial de base
de datos. Se cargan las tres funciones de disponibilidad originales del repositorio
y tablas mínimas ficticias. Los controles reales de autenticación no se prueban
con estas tablas mínimas.

Con `@electric-sql/pglite@0.5.8` disponible en un directorio de herramientas:

```bash
GASTROHELP_SQL_TEST_ROOT=/tmp/gastrohelp-sql-tests node scripts/test-room-capacity.mjs
```

Las comprobaciones cubren: modo apagado, cupo físico, cupo comercial menor,
bloqueo/desbloqueo, zonas/mesas inactivas, mesas sin zona, separación de restaurante,
excepciones, reservas existentes/cancelación, lectura antigua, altas y cambios que
exceden las plazas, conservación de reservas existentes, intervalos consecutivos,
exclusión de la reserva al cambiarla, alta de varias filas, permisos de auxiliares,
preservación del ajuste en clientes antiguos y reaplicación del borrador.

## Antes de publicarlo

1. Generar el archivo definitivo con `supabase migration new`. La CLI no pudo
   ejecutarse en esta sesión; no se ha inventado un nombre de migración.
2. Revisar el SQL generado contra las funciones realmente instaladas; aplicar
   solo en un destino de prueba autorizado y ejecutar los asesores de seguridad.
3. Probar con dos conexiones PostgreSQL reales: reserva frente a bloqueo de mesa,
   reserva frente a activación del modo, dos reservas simultáneas y cambio de hora
   frente a edición de Sala. PGlite tiene una sola conexión y no valida contención.
4. Verificar con una cuenta de restaurante que no puede acceder a otro local y
   que el modo demo permanece protegido.
5. Probar dos dispositivos y los formularios tras el código 503. Confirmar que no
   se duplica una reserva al repetir la petición y que un cambio rechazado conserva
   la reserva anterior.
6. Revisar zonas, mesas, turnos, cupos, agrupaciones y reservas futuras del piloto.
   El cambio necesita aprobación de publicación y activación explícita por local.

La prueba completa de creación/reprogramación y concurrencia en una base aislada
con el esquema real sigue pendiente. Estas pruebas locales no son una validación
del piloto ni de producción.
