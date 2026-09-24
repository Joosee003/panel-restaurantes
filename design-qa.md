# Design QA — La Reserva demo

## Alcance

- Ruta principal: `/restaurante/la-reserva-demo`.
- Recorridos: navegación, carta, detalle de plato, galería, contacto, reserva y páginas legales.
- Viewports: 1440×1000, 1280×800, 768×1024 y 390×844.
- Referencia: capturas de la demo previa y dirección artística «cuaderno mediterráneo de sobremesa».

## Pasada 1

| Severidad | Superficie | Hallazgo | Corrección |
| --- | --- | --- | --- |
| Alta | Color / legibilidad | Los `h1` y `h2` sobre fotografía y fondo oscuro heredaban el color global del panel. | Se identificó la web como `restaurant-public-site` para que los títulos hereden correctamente el color editorial de cada sección. |
| Alta | Navegación móvil | El menú móvil quedaba por debajo del hero por su orden de apilado. | El menú se movió fuera del `header` fijo y se elevó por debajo del control de cierre, pero por encima del contenido y CTA móvil. |
| Media | Responsive | Las categorías desplazables de la carta mostraban una barra horizontal nativa. | Se conservó el scroll táctil y se ocultó únicamente el indicador visual del navegador. |
| Media | Consola / desarrollo | El fallback local de la demo registraba como error la ausencia esperada de credenciales de Supabase. | El error se silencia solo cuando existe un fallback local seguro; los errores reales siguen registrándose. |
| Media | Consola / desarrollo | React en desarrollo necesitaba `unsafe-eval` para sus herramientas de diagnóstico. | Se permite solo con `NODE_ENV=development`; la CSP de producción no se relaja. |

## Verificación pendiente antes de cerrar

- Capturas finales y comparación visual de los cuatro viewports.
- Estados de navegación, tabs, modal de plato, galería y reserva.
- Consola limpia en build/preview de producción.
- Lint, build, rutas públicas, metadatos, JSON-LD y ausencia de scroll horizontal.
- Revisión básica de foco, contraste, nombres accesibles, `alt` y movimiento reducido.

**Estado:** pendiente de la pasada final sobre la preview desplegada.
