# Rediseño definitivo — baseline funcional preservado

Fecha: 26/09/2026. Rama de trabajo: `codex/gastrohelp-product-definitive`.

Baseline funcional y visual anterior: commit `699e9a2` (Turno vivo v1). Esta comparación no acredita sistemas externos ni sustituye QA conectada. La revisión usa código y datos sintéticos; no modifica producción ni datos de restaurantes.

## Pruebas locales observadas antes del cierre

- `npm run lint`: sin errores ni avisos en la revisión independiente.
- `node --test --test-force-exit tests/*.test.mjs`, con `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co` y `NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-test-key`: **240 casos, 236 pasan y 4 fallan** tras añadir la suite nueva de contratos de este rediseño (antes: 234/230/4).
- Contratos definitivos: 6/6. Contratos Turno vivo: 6/6. Clientes de reseñas: 7/7.
- `git diff --check`: correcto.
- `tests/review-customers.test.mjs` necesita únicamente un mock de CSS Module para su compilador manual. No se cambian assertions ni datos de prueba.
- Build y validación visual conectada deben registrarse en el cierre general, no se dan por ejecutados por esta comprobación.

## Cuatro fallos previos de aislamiento: no introducidos por el rediseño

Los nombres exactos en `tests/restaurant-isolation.test.mjs` son:

1. `account changes discard cache even with the same restaurant; refresh preserves drafts` — espera `owner-b`, observa `owner-a`.
2. `unauthorized selection is not returned; default is an assigned restaurant` — espera `null`, observa `foreign`.
3. `permission lookup error fails closed and does not silently select another restaurant` — no recibe el rechazo esperado `/offline/`.
4. `kitchen service isolates orders for an agency account with access to both restaurants` — en Windows, el loader manual usa comprobaciones `endsWith('/lib/supabaseClient.ts')` sobre rutas resueltas con separadores de Windows. El stub no intercepta ese módulo y el caso intenta consultar el host ficticio `example.supabase.co`; termina en `TypeError: fetch failed`, `ENOTFOUND`.

El cuarto resultado es una limitación del arnés local con variables dummy, **no evidencia de fuga de datos ni validación del aislamiento de cocina**. La causa del loader también puede afectar a otros casos; esta tarea no diagnostica ni corrige la capa de autenticación/aislamiento.

El archivo de prueba, `RestaurantScope.tsx`, `activeRestaurant.ts`, `getRestauranteUsuario.ts`, `supabaseClient.ts`, `app/services/pedidos.service.ts`, `lib/opiniones/restaurantSelection.ts`, `package.json` y lockfile permanecen iguales al baseline. Los fallos no se eliminan, silencian ni convierten en tests omitidos. Cualquier fallo adicional debe investigarse como regresión nueva.

## Contratos y alcance de la suite nueva

`tests/product-definitive-contracts.test.mjs` compara directamente contra `699e9a2`:

- integridad de API/backend, librerías, servicios, hooks compartidos, migraciones, n8n, guards, autenticación, variables/configuración versionada y CSS global;
- cadenas completas de consultas, filtros, mutaciones y RPC; hooks de datos, estado existente y funciones no visuales;
- conexiones de controles con acciones originales, incluidas server actions de `app/c/[token]`;
- ausencia de red, base de datos y almacenamiento en los componentes de presentación nuevos;
- CSS global nuevo limitado a `.gh-product-shell` y `.gh-product-scope`, con CSS Modules independientes para pantallas y app cliente;
- destinos, módulos, badges y submenús de navegación.

Las excepciones están enumeradas dentro del test y son exclusivamente helpers de presentación y memorias de clases CSS. La preparación de datos de la app cliente, sus server actions y las fórmulas de progreso/premios se comparan también como sentencias AST fuera del render. En ficha, `accion?.tipo` y `accion.tipo` se consideran equivalentes únicamente bajo la condición explícita `fidelizacionActiva && accion`. El efecto nuevo del layout abre/cierra el diálogo nativo de navegación; no cambia los guards. Los relojes son de presentación y no cambian la frecuencia de consulta de datos.

Esta suite congela deliberadamente el alcance de esta migración visual. Una futura tarea autorizada que cambie backend o contratos deberá revisar expresamente este baseline; no se debe relajar el test para hacer pasar un cambio no autorizado.

## Áreas de riesgo preservadas

- Reservas: funciones, estados, asistencia, consumo, mesa, bloqueos, validaciones, RPC, Realtime y polling conservados; los cambios de detalle/agenda son de presentación.
- Sala: disposición basada en datos existentes; sin modificar asignación, capacidad, relaciones ni acciones de reserva.
- Clientes: consultas, consentimiento, notas, etiquetas, puntos, segmentación y selección de restaurante conservados. La cronología combina únicamente registros ya cargados.
- Reseñas: controlador, deduplicación, finalidad del permiso, confirmación, transporte, enlaces y estados intactos. Abrir Google sigue sin confirmar reseña.
- Cocina/pedidos: permanece el polling de 3 segundos, los estados, sonido, pantalla completa, impresión, cierre/cobro y rotación QR. No se convierte en Realtime.
- Fidelización/app cliente: puntos, niveles, premios, cupones, canjes, notificaciones, server actions y consentimiento intactos. No se introducen predicciones ni métricas calculadas con información inexistente.
- Carta, menú, QR y rentabilidad: se preservan borradores, validaciones, guardado, traducciones, uploads, publicación/ocultación, precios, recetas y fórmulas existentes. Los formularios complejos se ajustan progresivamente, sin reescritura funcional.
- Ajustes: presentación de cabecera, navegación y secciones propias. `WhatsAppSettings.tsx` y su lógica no se modifican.
- Infraestructura, producción, Meta, WhatsApp, n8n, Supabase, RLS, RPC, Auth y Storage: sin cambios en esta migración.

No se leen ni limpian históricos dudosos para mejorar capturas. Los arneses visuales y capturas sintéticas viven en `local-only/` del proyecto padre y no forman parte de las rutas públicas.
