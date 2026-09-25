# Design QA — La Reserva

## Alcance

- Ruta limpia de Preview: `/restaurante/la-reserva`.
- Ruta de comparación de la primera pasada: `/restaurante/la-reserva-demo`.
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

## Pasada 2 — dirección «del producto al servicio»

- Se conserva el hero y se sustituye la repetición de grandes titulares en
  cursiva por una apertura de producto, una secuencia editorial horizontal y
  titulares más contenidos.
- Se incorporan tres fotografías provisionales creadas para esta dirección:
  `producto-tomate.webp`, `servicio-fuego.webp` y `mesa-vivida.webp`. Buscan
  luces, encuadres y momentos distintos (preparación, pase y mesa usada), pero
  deben reemplazarse por fotografía propia antes de una entrega real.
- El flujo de reserva mantiene fecha, personas, horas, validaciones, datos,
  consentimientos y confirmación. En la Preview aislada la disponibilidad es
  sintética y determinista, y el envío termina en una confirmación local: no
  se ejecuta el `POST` de reserva ni se persisten datos personales.
- El alias limpio `/restaurante/la-reserva` solo existe en desarrollo o en
  Vercel Preview. La ficha continúa marcada como `demo` internamente y mantiene
  `noindex`; no se convierte en una ficha pública de producción.

## Datos que deben sustituirse antes de entregar a un restaurante real

- Fotografías propias con autorización, créditos y recortes aprobados.
- Nombre fiscal, NIF/CIF, domicilio, email de privacidad y responsable legal.
- Dirección pública, teléfono, email, horarios y enlace exacto de Google Maps.
- Carta, descripciones, precios definitivos, alérgenos y disponibilidad real.
- Reglas de reserva: aforo, turnos, antelación, cancelaciones y contactos.
- Dominio/canonical, imagen Open Graph y perfiles sociales definitivos.
- Textos legales, política de cookies y plazo real de conservación.
- Analítica y consentimiento configurados para el stack acordado con el cliente.

No se deben rellenar estos campos con datos plausibles para completar el
diseño. La publicación real exige una ficha de restaurante configurada y la
validación del checklist de `docs/WEBSITE_DELIVERY.md` del proyecto padre.
