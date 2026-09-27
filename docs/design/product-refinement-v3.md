# GastroHelp V3 — refinamiento de producto sobre V2

Fecha: 27/09/2026. Rama: `codex/product-refinement-v3`.

Esta tarea refina la arquitectura visual existente. No sustituye los recorridos funcionales ni reconstruye el producto. No se ha publicado V3 en QA, Vercel, Hetzner ni producción.

## Base exacta y puntos de retorno

- Base de esta rama y frontend V2 QA: `0ab2a0efabaafe1e5e066d9754729cb5700a5ce3` (`codex/qa-frontend-v2`).
- Acceso seguro de agencia: `1f79ed21320d78ab3d26557e30a5b6212f9357a7`.
- Rediseño operativo V2: `0fbd55e4c3fd36c49bd6ee75c354f317aff22161`.

Los tres commits se conservan. La fuente exacta de `0ab2a0e` también está archivada en `local-only/product-refinement-v3/baseline-source/` y `baseline.zip` del proyecto padre. Estos artefactos no forman parte del commit. El punto de retorno inmediato es `0ab2a0e`; no se ha ejecutado ningún reset, rollback de despliegue ni modificación de sus entornos.

## Alcance implementado

| Superficie | Refinamiento | Qué permanece igual |
| --- | --- | --- |
| Hoy | Agenda por franjas temporales; servicio anterior accesible mediante desplegables; pedidos por mesa más compactos, con detalle bajo demanda. | Datos cargados, enlaces, módulos, estados y cálculo de antigüedad/urgencia. |
| Reservas | Notas distinguibles, menor peso de la acción repetida, contexto del detalle y calendario más denso. | Día, Calendario, Semana, Lista y Bloqueos; filtros, creación/edición, asistencia, mesa, consumo, validaciones y acciones. |
| Sala | Zonas explícitas y mesas como filas operativas: capacidad, reserva, hora, personas, estado y siguiente acción. Rail de asignación más compacto. | Zonas/mesas reales de la consulta, selección de franja, asignación, bloqueo y capacidad. No se inventa un plano físico. |
| Clientes | Tabla protagonista; segmentos visibles en dos grupos sin pills; mejor contraste de permiso, reseña y última visita; selección/foco y cabecera sticky. | Segmentación exclusiva existente, orden, búsqueda, consentimiento, niveles, ranking y acciones. |
| Ficha | Cronología central compacta, estados legibles y rail sticky con scroll. En móvil, acceso inferior a contacto/notas mediante el diálogo existente. | Historia ya cargada, filtros, contacto, etiquetas, notas, permisos y acciones. No se inventan visitas, reseñas ni canjes. |
| Reseñas | Cola más escaneable por cliente, estado, contexto y acción. | Avisos de automatización desactivada, permisos, deduplicación, confirmación y enlaces. Abrir Google no confirma una reseña. |
| Fidelización | Programa explicado mediante jerarquía de niveles, puntos/euro, premios, cupones y canjes; listas operables. | Reglas de puntos, niveles, validaciones, formularios y canje. |
| Métricas | Resumen editorial sin tres tarjetas pastel; una única categoría de pago se representa con importe y cierres, no mediante un donut. | Cálculos, periodos, embudo, series, datos de pago e información del resumen. |

La navegación horizontal y el acceso de agencia no se rediseñan ni cambian de comportamiento. La app cliente, web pública y La Reserva quedan fuera de V3.

### Franjas de Hoy: solo presentación

`app/(app)/dashboard/service-agenda.ts` clasifica copias de los registros ya recibidos, sin mutarlos ni eliminarlos:

- **Ahora:** hora prevista en los últimos 90 minutos y sin uno de los estados terminales contemplados por el helper.
- **Próximos 90 min:** hora prevista posterior al reloj y hasta 90 minutos después.
- **Antes de esta franja / Después:** resto de horas previstas, siempre consultables.
- **Completadas y bajas:** estados registrados de completado, cancelación o no-show. No se asigna un estado nuevo.
- **Sin hora válida:** registros conservados en una sección visible.

Las etiquetas temporales no afirman llegada, asistencia, retraso ni finalización del servicio. La interfaz recuerda que una hora prevista no prueba esos hechos. Sin reloj válido, conserva accesible la agenda completa. Los tests comprueban límites, conservación de todos los registros y ausencia de mutación del orden de origen.

## Diagnóstico: ocho pedidos urgentes frente al cierre de Work

**Observación en V2 QA autenticado:** en la revisión de aproximadamente las 21:43–21:45, había ocho pedidos abiertos con antigüedades de unos 62–83 minutos desde su creación. No se modificó el dataset para observarlos ni corregir capturas.

**Confirmación por código:** en `app/(app)/dashboard/page.tsx`, `pedidosLentos` incluye pedidos abiertos con `minutosDesde(created_at) >= 12` y `pedidosUrgentes` los que tienen `minutosDesde(created_at) >= 20`. Las mesas se ordenan por `maxMinutos` descendente. Esta regla y sus memoizaciones son idénticas al baseline `0ab2a0e`.

Por tanto, ocho pedidos abiertos que superan 20 minutos producen correctamente **ocho urgentes según la definición frontend existente**. No hay un fallo de contador demostrado en este snapshot. La anotación de Work «un pedido urgente» puede corresponder al momento de creación o a otra definición; esta tarea no ha verificado el timestamp ni la intención exacta del seed original y no presenta esa hipótesis como un hecho probado.

No se ha cambiado el umbral, el estado de ningún pedido ni su antigüedad. Tampoco se ha maquillado la discrepancia quitando el significado de urgencia. La UI explicita «urgente desde 20 min abierto». Cambiar esta definición requiere una decisión funcional separada.

## Blindaje del alcance

Auditoría de solo lectura contra `0ab2a0e`:

- **Cero diferencias** en API/backend, librerías de negocio, servicios, hooks compartidos, Supabase, migraciones, RLS/RPC, Auth, Storage, n8n, WhatsApp/Meta/WAHA, webhooks, aislamiento, agencia, variables/configuración versionada e infraestructura.
- Consultas completas, hooks y funciones no visuales de los diez TSX modificados comparados por AST: sin cambios. Las nuevas agrupaciones de Hoy son presentación sobre datos existentes; el formateador horario evita mostrar una fecha inválida.
- Clientes conserva 44 bloques de funciones/hooks; ficha 39; cronología 3, idénticos a `0ab2a0e`.
- Los callbacks, validaciones, valores y estados disabled de las superficies secundarias están cubiertos por contratos específicos.
- `tests/review-customers.test.mjs` añade únicamente el mock del CSS Module nuevo a su loader manual; no modifica assertions, casos, permisos ni fixtures.
- CSS limitado a módulos locales. `app/globals.css` y el CSS compartido del producto permanecen iguales al baseline.
- No se añaden dependencias. No se leen ni limpian históricos dudosos. No se cambia el dataset QA ni se envían comunicaciones.

## Pruebas locales ejecutadas

| Comprobación | Resultado observado |
| --- | --- |
| `npm run lint` | Correcto, sin errores. |
| `npx tsc --noEmit --pretty false` | Correcto en la revisión de Clientes/ficha. |
| `npm run build` | Correcto: Next.js 16.3.4, compilación optimizada, TypeScript y 47 páginas estáticas generadas. No equivale a un despliegue. |
| `node --test --test-force-exit tests/*.test.mjs` | **280 casos: 276 correctos, 4 fallos históricos, 0 omitidos.** |
| Contratos definitivos | 6/6 correctos. |
| Contratos Turno vivo | 6/6 correctos dentro de la suite completa. |
| Regresión nueva de agenda V3 | 5/5 correctos. |
| Contratos de superficies secundarias V3 | 5/5 correctos. |
| Agencia + contratos definitivos/Turno vivo + regresión V3, ejecución focalizada final | 46/46 correctos (24 de acceso agencia). |
| `git diff --check` | Correcto en las revisiones del diff. Los avisos de conversión LF/CRLF de Git no son fallos de whitespace. |
| Gitleaks sobre el diff preparado | Sin secretos detectados. Sin archivos de entorno ni `local-only` en el índice. |

Evidencia completa local, no versionada: `local-only/product-refinement-v3/tests-current.log` y `build.log` del proyecto padre. La suite usa valores de conexión ficticios, no las credenciales de QA ni producción. No acredita RLS conectada, entrega de mensajes ni persistencia externa.

### Los cuatro fallos históricos se conservan exactamente

Coinciden nombre y causa con `docs/design/product-definitive-functional-baseline.md` y `docs/design/agency-restaurant-access-qa.md`:

1. `account changes discard cache even with the same restaurant; refresh preserves drafts`: observa `owner-a`, espera `owner-b`.
2. `unauthorized selection is not returned; default is an assigned restaurant`: observa `foreign`, espera `null`.
3. `permission lookup error fails closed and does not silently select another restaurant`: falta el rechazo esperado `/offline/`.
4. `kitchen service isolates orders for an agency account with access to both restaurants`: `TypeError: fetch failed`, `ENOTFOUND example.supabase.co`, relacionado con el loader local de Windows y su comparación de rutas.

No se han corregido, silenciado ni omitido. La prueba de aislamiento y sus implementaciones permanecen intactas. El cuarto fallo no es evidencia de una fuga ni una validación satisfactoria del aislamiento de Cocina.

## Capturas: QA conectado y frontend local no son la misma evidencia

Las capturas viven únicamente en `local-only/product-refinement-v3/captures/` del proyecto padre:

- **`qa-v2-*`:** lectura del V2 publicado en `v2.qa.gastrohelp.es`, con sesión QA y el dataset ficticio alojado. Sirven para conocer la carga realista y observar el baseline; no son V3.
- **`v2-*`:** fuente exacta `0ab2a0e` renderizada localmente con un adaptador sintético.
- **`v3-*`:** código de trabajo V3 renderizado localmente con el mismo adaptador sintético que `v2-*`. **No son capturas de V3 conectado a Supabase QA.**

El adaptador local contiene 34 reservas del día, 80 clientes, 18 mesas y 8 pedidos abiertos, además de historia, reseñas y fidelización sintéticas. El reloj está fijado al **26/09/2026 a las 21:45 Europe/Madrid**. Es un volumen equivalente, no una copia ni una reproducción exacta del dataset QA: nombres, visitas, puntos, permisos, historiales y cantidades pueden diferir. No comparar sus cifras como si fueran resultados del mismo restaurante alojado.

Los mocks locales no usan credenciales reales, bloquean la red externa y permiten algunas acciones únicamente sobre memoria sintética. No deben presentarse como pruebas de escritura, invitación, autorización o transporte contra los sistemas alojados. Los arneses no son rutas de la aplicación y no entran en el commit.

### Capturas principales disponibles

- Escritorio: `v3-hoy-1440.jpg`, `v3-reservas-1440.jpg`, `v3-sala-1440.jpg`, `v3-clientes-1440.jpg`, `v3-ficha-1440.jpg`, `v3-metricas-1440.jpg`.
- Móvil: `v3-hoy-390.jpg`, `v3-reservas-390.jpg`, `v3-sala-390.jpg` y capturas complementarias de clientes, ficha, rail, detalle de reserva, reseñas, fidelización y métricas.
- Comparación local homogénea: utilizar los pares `v2-*` / `v3-*`, no mezclar cifras de `qa-v2-*` con las del fixture.

Galería local: `local-only/product-refinement-v3/comparativa.html`. Las 18 capturas principales (nueve pares) se revisaron visualmente: pantallas correctas, sin estados de carga ni cortes graves. La primera captura de ficha se rechazó y sustituyó por una captura estabilizada. Las capturas finales reflejan la segunda pasada CSS.

Los números de los nombres indican el **viewport DOM probado**, no el tamaño del raster. El capturador devuelve JPEG ajustado al área visible (por ejemplo 1425 × 990 y 375 × 812), aunque `innerWidth/innerHeight` confirmen 1440 × 1000 y 390 × 844. No se han escalado artificialmente las imágenes. Se corrigió su extensión a `.jpg` tras comprobar su formato real.

## Navegador: cierre local

Comprobaciones sobre código real, usando únicamente datos sintéticos locales. Las capturas de V2 QA alojado siguen siendo evidencia separada y de solo lectura.

| Comprobación | Estado de cierre |
| --- | --- |
| 1440, 1280, 1024 y 390 × 844 | `responsive-v3.json`: 32 comprobaciones (ocho superficies × cuatro tamaños), esperando contenido específico cargado. Ningún overflow horizontal de documento ni heading ausente. |
| Comparación visual V2/V3 | Nueve pares principales revisados; segunda pasada aplicada a ancho de Hoy móvil, anclas de Sala, calendario, cronología, alineación de Reseñas y niveles en Fidelización. |
| Reservas | Las cinco vistas accesibles en 390, sin overflow de documento. Detalle conserva notas completas. Tab/Shift+Tab ciclan entre los controles; Esc cierra y devuelve el foco a la reserva seleccionada. |
| Clientes y ficha | Ocho segmentos accesibles. Rail/contacto móvil abierto y cerrado con Esc; foco vuelve a Contacto y notas. Shift+Tab permanece en el diálogo. Selección y outline de foco conservados. |
| Hoy y Sala móvil | Anclas Llegadas/Mesas y pedidos e Ir a asignación/Mesas verificadas; destino visible bajo cabecera sticky (85 y 185 px respectivamente). Franjas de Sala tienen scroll lateral local intencionado, no overflow de página. |
| Módulos desactivados | Fixtures sin reservas y sin camarero digital no renderizan la sección desactivada. La sección restante aprovecha el ancho. No se altera ningún permiso o módulo alojado. |
| Contraste | Tokens principales sobre canvas comprobados: tinta 13,46:1; secundario 4,71:1; azul 5,40:1; verde 5,18:1; urgencia 5,56:1. Comprobación acotada, no certificación WCAG completa de toda la aplicación. |
| Reduced motion | Reglas de reducción verificadas en código y CSSOM cargado; los gráficos de Métricas no animan su entrada. No se emuló la preferencia del sistema operativo: esa comprobación manual queda pendiente. |
| Agencia | Recorrido sintético A → retorno → B, refresh en A y logout comprobados. B muestra exclusivamente nombres con su sufijo B. Sesión de agencia visible en390; logout retira contexto y muestra signed-out. No acredita RLS alojada. |
| Consola/runtime | Sin errores de consola en el recorrido local. Avisos iniciales de dimensiones `width(-1)/height(-1)` de Recharts reproducidos también en V2; gráficos visibles tras medición. No se silenciaron ni se presentan como regresión nueva. |

No se ha ejecutado una auditoría completa con lector de pantalla ni validación V3 conectada contra QA: requieren una pasada posterior separada. No se han realizado escrituras en el dataset alojado para probar acciones.

## Archivos del cambio

Inventario observado antes del commit; confirmar con `git diff --name-only 0ab2a0e` y los archivos nuevos al cerrar:

- Hoy: `app/(app)/dashboard/page.tsx`, `ServiceArrivals.tsx`, `service-board.module.css`, `service-agenda.ts`.
- Reservas: `app/(app)/reservas/page.tsx`, `service.module.css`.
- Sala: `app/(app)/sala/page.tsx`, `sala.module.css`.
- CRM: `app/(app)/clientes/page.tsx`, `[id]/page.tsx`, `CustomerTimeline.tsx`, `crm.module.css`.
- Reseñas: `app/(app)/resenas/ReviewRequestsPanelView.tsx`, `review-queue.module.css`.
- Fidelización: `app/(app)/dashboard/fidelizacion/cupones/page.tsx`, `loyalty-programme.module.css`.
- Métricas: `app/(app)/estadisticas/page.tsx`, `metrics-refinement.module.css`.
- Tests: `tests/review-customers.test.mjs`, `tests/product-refinement-agenda.test.mjs`, `tests/product-refinement-secondary.test.mjs`.
- Este registro: `docs/design/product-refinement-v3.md`.

No incluye capturas, logs, arneses de `local-only`, datos de QA, secretos ni archivos de entorno. Commit local y publicación son acciones distintas: el cierre de este documento no autoriza ningún push ni despliegue.
