# Design QA — GastroHelp, producto definitivo · 26/09/2026

final result: passed

## Alcance y evidencia visual

- Rama: `codex/gastrohelp-product-definitive`. Baseline: `699e9a2`.
- Fuente de dirección: `docs/design/service-direction-reference.png` (1536×1024). Es una composición orientativa, no un contrato pixel-perfect: el usuario autorizó replantearla y prohibió inventar estados/datos.
- Implementación abierta en navegador: código real mediante adaptador sintético exclusivamente local, `http://127.0.0.1:4175`.
- Evidencia final: `../local-only/product-definitive/captures/final-{hoy,reservas,clientes,ficha,sala,cocina}-{1440,390}.png`.
- Comparación anterior: `../local-only/product-definitive/baseline/hoy-turno-v1-1440.png`. Fuente Git anterior con sus propias clases Tailwind; no se considera válido el primer render con el margen del sidebar ausente por el scanner del arnés.
- Viewports CSS: 1440×1000, 1280×1000, 1024×1000, 390×844. Capturas a densidad 1; escritorio y móvil comparados en su tamaño propio, sin escalar móvil dentro de escritorio. El gutter de scrollbar de Windows ocupa 15 px.
- Estado: La Mesa, datos completamente sintéticos, sábado 26/09/2026 a las 21:15; agenda, clientes y pedidos cargados. La ficha usa una cliente ficticia con reservas, movimientos y notificación. No se leen históricos reales para capturas.
- Comparación conjunta: referencia refinada + Hoy implementado; baseline anterior + Hoy implementado; reservas/lista/ficha vistas conjuntamente y detalles móviles por separado. La fuente incluye dos superficies y un plano ilustrado: se compara dirección/jerarquía, no geometría literal.
- Regiones focales comprobadas: cabeceras, franja temporal, filas de agenda/CRM, estados, rail y sheets de reserva/contacto. No se acepta como prueba una captura de la pantalla de carga.

## Pasadas y correcciones verificadas

1. **P2, densidad:** la primera agenda repetía fecha/origen/consumo y solo mostraba unas ocho filas. Se compactó a filas de 43–56 px, fecha explícita en Lista y origen en detalle. Captura posterior `final-reservas-1440.png`.
2. **P2, jerarquía móvil:** Reservas y Clientes apilaban demasiado contexto. Mesa/estado y permiso/fidelización ahora comparten líneas; todos los campos siguen accesibles. Evidencia anterior `pass2-{reservas,clientes}-390.png`, posterior `final-{reservas,clientes}-390.png`.
3. **P1, contraste de Cocina:** un selector visual demasiado amplio anulaba el fondo oscuro de los botones y mantenía texto blanco. Se restringió a contenedores de iconos y se definieron controles claros con texto oscuro. Comparación `mobile-panel-pedidos-qr.png` → `final-cocina-390.png`.
4. **P2, aislamiento visual:** `<main>` anidados heredaban fondo global y duplicaban gutters. Sustituidos por wrappers de presentación donde correspondía; la app cliente protege su fondo configurable. `globals.css` no cambia.
5. **P2, foco/identificadores:** IDs de submenú únicos entre escritorio y móvil; Escape cierra navegación/detalle/contacto y devuelve foco. El fondo queda modal mediante diálogo nativo o trap existente del componente nuevo.
6. **P2, lectura:** se separó título/estado en cronología móvil y se oscureció el token secundario a `#607279` para superar 4.5:1 sobre el fondo del panel.

## Superficies de fidelidad

- **Tipografía:** familia existente sin descarga nueva; títulos 23–26 px, cifras horarias tabulares y pesos ópticos diferenciados. Sin títulos gigantes para llenar espacio. Truncados solo en resúmenes con texto completo en detalle.
- **Ritmo/layout:** navegación horizontal prioriza Hoy/Reservas/Sala/Clientes; resto agrupado sin perder destinos. Filas, líneas y proximidad sustituyen la colección de tarjetas del primer bloque. Los formularios de alto riesgo y comandas conservan estructura interior.
- **Color:** tinta, grises verdosos y papel; azul para acción/selección/foco, estados con texto además de color. Sin dark mode ornamental. Revisión básica de contraste, no certificación WCAG exhaustiva.
- **Imágenes:** no se introducen fotografías, avatares ni un plano ficticio. Sala muestra las zonas/mesas que ya carga; Hoy usa los pedidos QR por mesa existentes. El dibujo y fases de plato del mock no se trasladan porque el DTO no los soporta.
- **Copy/datos:** no se añaden predicciones, LTV, ingresos estimados ni incidencias inventadas. «Próxima hora» se refiere a reservas previstas, no acredita llegada/asistencia. Estados y cálculos originales preservados.

## Interacción, responsive y límites

- Verificadas navegación, cinco vistas de Reservas, filtros, rail/sheets, Escape y restitución de foco, cambio A/B, módulo de reservas desactivado, carga/vacío/error/cliente inexistente.
- Asistencia, mesa y consumo ejercitados solo contra adaptador en memoria; el registro visible confirma los argumentos RPC originales. No prueba transacciones, RLS ni reglas del servidor.
- Sin desbordamiento horizontal del documento en las superficies capturadas. Franja próxima hora, segmentos y tablas extensas conservan desplazamiento contextual intencionado.
- App cliente: seis pestañas SSR a 390 px con CSS real y datos sintéticos, sin hidratación ni ejecución de server actions; imágenes `client-app-*-390.png`. Rascado, animación de nivel, onboarding y enlace inválido se preservan, no se dan por revalidados de extremo a extremo.
- Consola local: sin errores nuevos de aplicación en recorridos normales; Recharts emite aviso de medición inicial en el arnés. Los errores sintéticos de lectura son intencionados. Preview requiere comprobación adicional con entorno real autorizado; no equivale a QA productiva.
- Los cuatro fallos históricos de aislamiento permanecen visibles: `docs/design/product-definitive-functional-baseline.md`.

Sin hallazgos visuales P0/P1/P2 nuevos pendientes en el alcance validado. Excepción explícita de alcance por riesgo: `LevelExperience` conserva su interior negro/dorado anterior y no queda visualmente consolidado con el resto de la app; `ScratchCoupon` conserva el interior raspable. No se presentan como rediseñados ni como revalidados interactivamente. Los formularios complejos y la estructura interna de comandas también mantienen partes anteriores para una tarea posterior con pruebas específicas.

## Histórico conservado — QA anterior de La Reserva

El contenido que sigue pertenece a la web pública anterior, no al rediseño actual del panel.

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
