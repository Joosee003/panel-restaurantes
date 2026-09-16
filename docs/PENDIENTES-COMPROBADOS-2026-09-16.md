# Continuación de las comprobaciones · 16 septiembre 2026

**El encargo sigue abierto. Hay comprobaciones críticas pendientes fuera de WhatsApp.**

Se ha trabajado sobre el proyecto existente, sin añadir servicios de producto ni cambiar colores. Las escrituras de prueba y las restauraciones se han ejecutado en bases temporales con datos ficticios. En producción se han aplicado restricciones de seguridad y se han recorrido pantallas en modo lectura. No se han creado clientes de prueba en restaurantes reales, contactado clientes ni restaurado una copia sobre producción.

## Versión publicada

- [PR 71 integrada](https://github.com/Joosee003/panel-restaurantes/pull/71), commit `a1fbbdbf5545771cb2d7ca70cc29744ce3d3db9c`.
- Vercel `dpl_AM9py5rDxiMWjPCfH9HrHzF93KX1`, READY, asignado a `panel.gastrohelp.es`.
- Navegador tras publicar: una mesa abierta y aviso de cuenta pendiente; coincide con Cocina. Ancho visible y ancho de página: 1348/1348.
- [Evidencia de publicación, base y cron](evidence/2026-09-16/remaining-production-verification.json). Capturas disponibles: `dashboard-mesas-antes-20260916.jpg` y `alta-validacion-20260916.jpg`. La captura posterior del Dashboard falló por tiempo de espera del navegador; el contador corregido queda acreditado en la lectura DOM registrada, no en una captura posterior.

## Cambios y resultado

| Apartado | Qué se ha probado | Resultado y límite | Evidencia |
|---|---|---|---|
| Permisos y separación | Seis perfiles: dueño A, dueño B, dueño de ambos, agencia, demo y usuario sin local; también visitante anónimo. Lectura y escritura, relaciones cruzadas, puntos, recetas, productos, mesas y metadatos de imágenes. | **Verificado en SQL aislado:** 171 comprobaciones superadas. Antes de la corrección, 48 permitían una operación indebida. Falta certificar JWT, API Storage y Realtime con cuentas alojadas separadas. | [Antes](evidence/2026-09-16/security-matrix-before.json), [después](evidence/2026-09-16/security-matrix-after.json), [CI PostgreSQL](https://github.com/Joosee003/panel-restaurantes/actions/runs/35083351750). |
| Invitación y acceso | Idempotencia del alta, bloqueo de entrega simultánea, reintento, resultado incierto, asociación al restaurante, permisos del responsable y recorrido SQL hasta visita y puntos. Acceso real de agencia y validación del formulario vacío en navegador. | **Parcial:** recorrido SQL y acceso de agencia comprobados. No se ha enviado una invitación de prueba ni acreditado recepción, primer acceso de dueño, recuperación, enlace caducado o cuenta ya existente con el proveedor real. | `scripts/test-agency-onboarding.mjs`; 32 pruebas de agencia y contador ejecutadas; captura `alta-validacion-20260916.jpg`. |
| Concurrencia | Dos conexiones PostgreSQL independientes y observación de una espera real por bloqueo antes de liberar la primera transacción. Alta, invitación, último hueco, canje y seis carreras de reseñas. | **Verificado:** diez casos. Una instalación, una reclamación de envío, una reserva para el último hueco, un canje y un descuento de puntos. Sin transporte externo. | [Registro de ejecución](evidence/2026-09-16/remaining-operational-checks.json), `scripts/test-closure-postgres.mjs`. |
| Recuperación | `pg_dump` y `pg_restore` a una segunda base vacía. Comparación de huellas de todas las filas, políticas y restricciones; lectura del dueño y denegación del otro restaurante tras restaurar. | **Verificado solo para copia SQL ficticia:** 60 tablas, 21 filas y 254 políticas; restauración de 539 ms en la ejecución registrada. No representa el tiempo de recuperación de producción. Copias del proveedor, Auth alojado, ficheros de Storage y volúmenes de Hetzner siguen sin recuperar. | [Registro y SHA-256 del archivo temporal](evidence/2026-09-16/remaining-operational-checks.json), [ejecución registrada](https://github.com/Joosee003/panel-restaurantes/actions/runs/35083061359). |
| Alertas | Ejecución sintética del flujo actual de avisos con `suppressDelivery=true`. Revisión del cron y de errores de Vercel. | **Parcial:** n8n 70280 terminó sin ejecutar SMTP; cron activo, diez de diez ejecuciones recientes correctas. Vercel no devolvió errores en la hora consultada. Esto no acredita una alerta automática ni un correo recibido. | [Ejecución n8n y límites](evidence/2026-09-16/remaining-operational-checks.json). |
| Rendimiento | Tres lecturas HTTP secuenciales por ruta: login, web de demo y API de agencia sin sesión. Asesor SQL y registros del servidor. | **Pendiente:** medianas de 10,63 s, 10,43 s y 10,29 s desde este entorno, incluyendo red. Respuestas 200/200/401. Los registros consultados no ofrecen duración suficiente para atribuir la demora a la aplicación. No hay una mejora antes/después acreditada ni una prueba de carga autenticada. | [Mediciones y condiciones](evidence/2026-09-16/http-performance.json), [avisos del asesor](evidence/2026-09-16/remaining-operational-checks.json). |
| Pantallas existentes | Navegación, filtros, búsquedas, pestañas y estados de demo; validación inicial del alta de agencia. | **Parcial:** pantallas comprobadas en lectura. Se detectó y corrigió el contador de mesas servidas pendientes de cobro. Guardados y recorridos completos desde pantallas requieren el entorno separado. | [Registro por módulo](evidence/2026-09-16/ui-module-checks.json), pruebas `dashboard-open-orders.test.mjs`. |

## Correcciones aplicadas

1. **Relaciones entre restaurantes.** Las políticas limitaban qué filas se podían ver, pero no todas las relaciones exigían que el cliente, mesa o producto perteneciese al mismo restaurante. Se añaden 35 claves foráneas compuestas y comprobaciones para recetas y líneas de pedido. También se impide mover los padres de esas relaciones a otro local.
2. **Imágenes de la demo.** Tres políticas restrictivas bloquean inserción, modificación y borrado desde la cuenta demo. Las imágenes destinadas a carta y premios públicos siguen siendo públicas.
3. **Mesas pendientes de cobrar.** El Dashboard consideraba «servido» y «entregado» como estados de cierre. Ahora conserva esa mesa abierta hasta cobro, cierre o cancelación. La consulta también conserva pedidos sin terminar de días anteriores y mantiene el filtro del restaurante.

Migración aplicada: **`20260916095954_enforce_restaurant_relations`**. Verificación posterior: 35 restricciones presentes, 34 validadas y tres políticas restrictivas de Storage. Los dos saldos anteriores sin cliente asociado se conservan; su restricción protege las escrituras nuevas, pero queda sin validar sobre esas filas antiguas. No se han borrado ni reasignado.

La matriz local anterior coincide con las **251 políticas** observadas antes de la migración. Esto respalda la reproducción del fallo, pero no sustituye una prueba de sesión real contra Auth, Storage y Realtime.

## Pantallas recorridas

| Pantalla | Acción realizada | Resultado |
|---|---|---|
| Sala | Cambiar comida/cena y franja | Mesas y reservas visibles cambian con la selección. |
| Clientes | Buscar texto inexistente; filtro VIP | Cero resultados en búsqueda inexistente; dos en VIP; controles de contacto desactivados. |
| Rentabilidad | Buscar Croquetas | Se muestra el plato correspondiente. |
| Fidelización | Alternar premios y cupones | Cuatro premios y tres cupones visibles. |
| Canjes | Abrir pantalla de validación | Canjes y promociones cargan; no se confirma ni cancela ninguno. |
| Carta | Buscar Croquetas | Se muestra el producto correspondiente. |
| Menú del día | Abrir formulario y secciones | Datos y vista previa disponibles; no se guarda. |
| QR mesas | Abrir listado | Doce mesas en dos zonas; copiar/QR desactivados en demo. |
| Cocina | Cambiar cocina, historial y mesas abiertas | Historial y una mesa abierta visibles. |
| Métricas | Abrir resumen | Embudo, facturación, periodo de 30 días y pagos visibles; cifras históricas no certificadas. |
| Ajustes | Abrir horarios y WhatsApp | Horarios y capacidad disponibles; «Sin número vinculado» y «Sin conectar»; demo no puede conectar. |
| Reseñas | Seleccionar Sin permiso | Dos entradas; ningún envío realizado. |
| Reservas | Calendario, lista y búsqueda inexistente | Estado «No hay reservas con estos filtros». |
| Alta de agencia | Entrar con sesión y continuar con campos vacíos | Validación nativa; no avanza ni crea un restaurante. |
| Dashboard | Comparar con Cocina | Antes: cero frente a una mesa abierta. Corrección con pruebas automáticas y comprobación tras publicar registrada en la evidencia final. |

Estas lecturas no acreditan guardar, cobrar, asignar mesas, conceder puntos, canjear, publicar una carta ni recuperar contraseñas desde las pantallas. Tampoco certifican todos los formularios en móvil.

## Pruebas ejecutadas y fallos intermedios

- Matriz de permisos: 123 correctas y 48 fallidas antes; 171 correctas y ninguna fallida después.
- `node scripts/test-agency-onboarding.mjs`: recorrido SQL correcto con todas las migraciones y políticas de Storage actuales.
- `node --test tests/agency-*.test.mjs tests/dashboard-open-orders.test.mjs`: **32/32**.
- PostgreSQL alojado temporalmente en CI: diez pruebas con conexiones independientes y una restauración lógica correctas. Se comprueba el bloqueo con `pg_stat_activity`; no se presenta una cola secuencial de PGlite como concurrencia.
- [Panel quality](https://github.com/Joosee003/panel-restaurantes/actions/runs/35083351678): lint, aislamiento, lógica de reseñas y canales, integraciones SQL, HTTP sintético, auditoría de dependencias y compilación correctos. Tipos comprobados también localmente.
- La primera ejecución nueva de concurrencia falló porque la prueba esperaba JSON donde la función devuelve `SLOT_NOT_AVAILABLE` como excepción SQL. Se corrigió la expectativa y se volvió a ejecutar completa.
- Una ejecución posterior de lint rechazó el nombre `module` en la prueba. Se corrigió el nombre y se repitió la comprobación completa. No se omitieron pruebas para obtener un resultado correcto.

Los asesores conservan avisos anteriores sobre [evaluación de RLS](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan), [claves sin índice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [funciones elevadas accesibles](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) y [contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se consideran resueltos ni se cambian políticas masivamente sin medir su efecto.

## A. Necesita el número

- Vinculación del número propio de cada restaurante.
- Recepción y salida de mensajes, separación real de sesiones, conversación de chatbot y petición de reseña con entrega comprobada.
- Comprobar que la vinculación no procesa mensajes históricos ni solicitudes antiguas.

## B. Pendientes ajenos al número

1. **Entorno alojado de prueba y cuentas.** Falta un proyecto/ramal separado de Supabase con Auth, Storage y Realtime, y una URL del panel conectada exclusivamente a él. Debe permitir crear dos restaurantes ficticios y probar dueño A/B, usuario con ambos y usuario sin acceso. Solo está disponible la rama alojada `main`; la base temporal de CI no ofrece estos servicios alojados. No se ha contratado un entorno.
2. **Correo y acceso de dueño.** Hay sesión de agencia y un buzón propio conectado, pero falta ejecutar la invitación desde ese entorno separado y comprobar recepción, remitente, enlaces, primer acceso, recuperación, caducidad y cuenta existente. Las credenciales deben introducirse mediante el acceso seguro del navegador, nunca en un mensaje.
3. **Copias reales e infraestructura.** Falta acceso de lectura al inventario y archivos de backup de Supabase/Storage, y conexión SSH de Hetzner con permiso para inspeccionar y copiar la configuración y volúmenes necesarios de n8n/WAHA. Los dos flujos SSH observados no tienen una credencial asignada. También falta un destino aislado autorizado donde recuperar esos archivos con envíos y tareas desactivados. Frecuencia y retención no están acreditadas.
4. **Alerta automática recibida.** Falta identificar y ejercer la regla de fallo del monitor operativo y su destino de prueba. La ejecución manual sin envío no cubre fallo → disparo automático → recepción. No se ha creado un nuevo sistema de alertas ni alterado flujos antiguos.
5. **Datos anteriores y validación.** Hay entradas antiguas en la demo que no están inequívocamente identificadas como ficticias y dos saldos sin cliente. Hace falta clasificarlas antes de retirar datos o dar por acreditada la ausencia de información privada en la demo. No se publican nombres ni contactos de esas entradas en este informe.
6. **Pruebas funcionales y rendimiento restantes.** Guardados y recorridos desde pantallas con dos cuentas, cambios de sesión y caché, suscripciones Realtime, archivos reales de Storage, todos los formularios móviles y carga autenticada. La demora HTTP observada necesita una medición con trazas o tiempos de navegador adecuados antes de atribuirla y corregirla.

## Vuelta atrás

La corrección de interfaz se puede retirar mediante un despliegue anterior. No retirar automáticamente las restricciones de seguridad ni restaurar datos sobre producción. Conservar los dos saldos y las invitaciones existentes; cualquier reparación de datos necesita identificación y decisión explícitas. Las bases de CI son temporales y se eliminan con su contenedor; no contienen datos de clientes reales.
