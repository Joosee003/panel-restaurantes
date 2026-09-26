# Product UI v1 — baseline de regresión

Fecha: 2026-09-26

Rama de trabajo: `codex/product-ui-v1`

Base observada antes del rediseño: `3187d1f2888fde73281860130e19913b0ae9290b`

## Alcance de esta fase

El primer bloque visual cubre únicamente Dashboard, Reservas, Clientes y ficha de cliente. La intervención es de presentación, navegación responsive y accesibilidad básica. No autoriza cambios en Supabase, migraciones, RLS, RPC, contratos API, webhooks, automatizaciones, reglas de negocio, datos ni transportes externos.

## Fallos de aislamiento ya presentes

Antes de modificar la interfaz se ejecutó `tests/restaurant-isolation.test.mjs`. La base ya presentaba estos cuatro fallos:

1. `account changes discard cache even with same restaurant; refresh preserves drafts`
2. `unauthorized selection not returned; default assigned`
3. `permission lookup error fails closed`
4. `kitchen service isolates orders for agency multi-restaurant`

La misma prueba se repitió tras el rediseño y devolvió exactamente esos cuatro fallos, sin fallos adicionales. No forman parte de este trabajo y no deben atribuirse al sistema visual Turno vivo.

## Contratos protegidos en esta fase

- Selección y aislamiento de restaurante, guards, permisos, módulos y rutas existentes.
- Consultas, mutaciones, RPC, validaciones, estados y efectos ya existentes.
- Realtime y polling actuales, sin cambiar un mecanismo por otro.
- Reservas: estados, asistencia, mesa, consumo, no-show, cancelación y bloqueos.
- Clientes: consentimiento, puntos, niveles, notas, etiquetas e historial.
- Bloqueo de orientación conservado fuera de las cuatro rutas aprobadas.

`tests/turno-vivo-contract.test.mjs` añade comprobaciones estáticas específicas para detectar cambios accidentales en estos contratos durante esta fase.

## Evidencia local

- `npm run lint`: correcto.
- `npm run build`: correcto con variables públicas de CI ficticias; no se usaron secretos ni datos reales.
- `tests/turno-vivo-contract.test.mjs`: 5/5.
- `tests/dashboard-open-orders.test.mjs` y `tests/public-demo-booking.test.mjs`: 3/3.
- Revisión visual aislada en 1440, 1280, 1024 y 390 px: sin scroll horizontal.
- El arnés visual usó datos sintéticos y se retiró antes de la comprobación final.

Las capturas de auditoría no se versionan porque el repositorio local no contiene la configuración de entorno necesaria para representar las pantallas conectadas de forma segura. La validación con datos de entorno deberá realizarse en una Preview autorizada.
