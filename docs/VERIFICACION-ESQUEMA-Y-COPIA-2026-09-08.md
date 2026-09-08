# Esquema de aplicación y recuperación — 8 de septiembre de 2026

**Superados: restauración de los datos guardados, 12 recorridos con las reglas
actuales y 26 pruebas con operaciones simultáneas sobre el catálogo capturado.**
El recorrido con navegador y la recuperación de toda la plataforma siguen
pendientes. Los seis archivos de `docs/sql` continúan como borradores sin aplicar
a producción.

## Evidencia reproducible

Commit de código comprobado: `0461b76454a2db6c5069ace83c70f66e088e020c`.

- [SQL y concurrencia: correcto](https://github.com/Joosee003/panel-restaurantes/actions/runs/34222507044/job/102048713890),
  terminado el 8 de septiembre de 2026 a las 11:47 UTC.
- [Lint, auditoría de dependencias y compilación: correcto](https://github.com/Joosee003/panel-restaurantes/actions/runs/34222507044/job/102048713653).
- La misma ejecución conserva las 221 comprobaciones anteriores y las 26
  carreras sobre esquemas reducidos. Las 26 carreras del catálogo capturado son
  un grupo adicional, con sus propias conexiones.

El catálogo procede de una consulta de lectura a las 11:15 UTC del mismo día.
Se reconstruyeron 50 tablas públicas, 5 vistas, 102 funciones, 60 disparadores y
242 políticas, además de la estructura de `auth.users`. Se conservaron los
propietarios, permisos explícitos, restricciones e índices del ámbito exportado.
Los seis borradores se aplicaron después sobre esa base vacía.

La copia publicada en `tests/fixtures` contiene únicamente estructura. Sustituye
3 correos, 7 URL y 33 identificadores literales, además del nombre de una ruta,
por valores ficticios; sus destinos externos usan `.invalid`. No contiene filas,
contraseñas, sesiones ni archivos de clientes. El catálogo original se conserva
en privado y no debe subirse al repositorio público.

## Recorridos con reglas actuales

Las identidades y los restaurantes son ficticios; las funciones, políticas y
disparadores proceden del catálogo actual. El alta de las dos identidades se
prepara sin disparar invitaciones. Las operaciones de la aplicación ejecutan sus
reglas normales.

- Un pedido anónimo entra por `crear_pedido_mesa_qr_seguro`, el mismo RPC de la
  carta pública. Usa el precio del servidor e invalida el importe de una cuenta
  calculada antes de recibir el nuevo pedido.
- Un cierre vinculado crea una visita, un movimiento de puntos y una venta. La
  respuesta, el saldo del cliente y el libro de movimientos coinciden: 70 puntos
  por 35,30 de consumo neto; propina excluida. El coste observado es 4.
- Repetir el cierre conserva la respuesta y sus registros. Cambiar el importe
  con el mismo identificador de operación se rechaza.
- El consumo manual y el QR no duplican visitas o puntos, con cualquiera de los
  dos como primera operación.
- Otro restaurante, una identidad anónima y una cuenta demo no pueden cerrar la
  cuenta. Declararse administrador en metadatos del usuario no concede acceso.
- Un pedido cobrado no puede modificarse directamente.
- Con fidelización desactivada se guardan visita y venta sin conceder puntos.
- Las reservas del panel respetan sus políticas reales y el límite de plazas
  cuando se vincula a la Sala.

Las 26 carreras cubren confirmación y reversión, repetición de una operación,
identificadores diferentes, cliente bloqueado, captura de ventas, desactivación
de módulos, pedidos que llegan durante el cierre, cocina y cambios de plazas.
Dos conexiones escriben y una tercera observa el bloqueo antes de liberar la
primera transacción. Procesos de esta ejecución: **2604, 2605 y 2606**.

La primera ejecución detectó que el test intentaba insertar directamente un
pedido QR con el rol del empleado, operación que las políticas reales rechazan.
Se corrigió el test para utilizar el RPC público con el rol anónimo; no se
relajaron permisos de la aplicación para obtener un resultado correcto.

## Recuperación de la copia del 11 de agosto

La suma SHA-256 y la integridad del ZIP guardado son correctas. En una base nueva
en memoria se importaron sus **691 registros de 47 tablas públicas**, junto con
los datos de identidad conservados de 3 usuarios.

Se usó el catálogo actual, sin aplicar los seis borradores. Durante la carga se
desactivó la ejecución de disparadores para no repetir visitas, puntos o envíos.
Después se recrearon y validaron **75 claves foráneas**. Los valores de todas las
filas importadas se compararon contra el contenido guardado, pasando ambos por
los tipos de columna de PostgreSQL. No hubo diferencias.

Esta prueba confirma la recuperación de esos datos de agosto en la estructura
capturada de septiembre. No confirma una recuperación del estado actual: la
copia es anterior y le faltan contraseñas, sesiones, MFA y los binarios de los
11 objetos de Storage que enumera. El esquema JSON antiguo tampoco contiene
por sí solo todas las funciones y los permisos necesarios para reconstruir la
plataforma.

## Ejecutar de nuevo

Las dependencias tienen versiones fijadas en `tests/sql/package-lock.json`:
PGlite 0.5.8, pg 8.23.0 y PostgreSQL 17.6.

```sh
node scripts/test-application-catalog.mjs \
  tests/fixtures/application-catalog-2026-09-08.json \
  tests/sql/node_modules/@electric-sql/pglite/dist/index.js

node scripts/test-application-concurrent.mjs \
  tests/fixtures/application-catalog-2026-09-08.json \
  tests/sql/node_modules/@embedded-postgres/linux-x64/native/bin \
  tests/sql/node_modules/pg

node scripts/test-recovery-data.mjs \
  /ruta/privada/catalogo-actual.json /ruta/privada/datos-recuperacion.json \
  tests/sql/node_modules/@electric-sql/pglite/dist/index.js
```

La prueba simultánea requiere un usuario ordinario y los enlaces de bibliotecas
del paquete PostgreSQL preparados como en la CI. Crea su propio clúster con un
socket privado y TCP desactivado. Los verificadores no aceptan URL de bases
existentes ni credenciales de Supabase. El importador privado no imprime filas.

## Lo que queda por comprobar

1. Un Supabase separado con Auth, API y configuración de despliegue; el catálogo
   capturado no reemplaza esos servicios. Revisar también permisos
   predeterminados, publicación por API, Storage y extensiones HTTP.
2. Una vista previa conectada exclusivamente a ese Supabase y cuentas ficticias
   de dos restaurantes, con correo, WhatsApp y automatizaciones externas
   desactivados.
3. Dos sesiones de navegador: pedido, cierre, reserva, historial, puntos y venta;
   recarga y respuesta perdida, cambio de restaurante/fecha, cocina y plazas.
4. Una copia reciente con roles, esquema, datos y archivos, seguida de la
   recuperación de accesos y del servicio completo.
5. Generar las migraciones con la CLI tras aceptar esas pruebas y revisar el
   orden de instalación antes de publicar el frontend.

La vista previa de Vercel ya es accesible mediante su mecanismo autorizado y
muestra el acceso del panel. No hay una sesión de aplicación disponible ni una
base de pruebas conectada. No se han generado pedidos reales para suplirlo.

La organización sigue en Free y tiene dos proyectos activos. Free admite dos
proyectos activos y no incluye ramas de desarrollo. La tarifa consultada para
una rama Micro empieza en 0,01344 USD/h; requiere un plan de pago. Pro empieza
en 25 USD/mes y cada proyecto Micro adicional supone unos 10 USD/mes: trasladar
los dos proyectos actuales a Pro supone aproximadamente 35 USD/mes antes de la
rama y del consumo adicional. No se ha cambiado la suscripción ni creado un
recurso de pago. Se necesita confirmar el coste antes de hacerlo.

Fuentes: [tarifas de Supabase](https://supabase.com/pricing) y
[uso de ramas](https://supabase.com/docs/guides/platform/manage-your-usage/branching).
