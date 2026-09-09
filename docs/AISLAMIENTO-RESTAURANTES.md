# Separación de restaurantes — 9 de septiembre de 2026

## Incidencia y corrección

Jose informó de reservas iguales al cambiar de restaurante y de que no veía «Jose · Prueba lista».
La reserva existe en **DEMOOOO**, el 9 de septiembre a las 11:00, sin asistencia marcada.
La demo pública «La Reserva · Demo GastroHelp» es otro restaurante y no debe mostrar esa reserva.

Se encontraron estos fallos en el panel de agencia:

- `useRestaurante` usaba una consulta común en una caché que sobrevivía al cambio de restaurante y de cuenta.
- La selección guardada en `localStorage` podía cambiar las consultas de otra pestaña. La cabecera y las páginas tampoco compartían un reinicio de estado.
- Cocina leía pedidos sin filtrar por el restaurante activo. La cuenta de agencia puede acceder a varios restaurantes, así que los permisos de la base de datos no sustituyen ese filtro.
- Ocupación elegía el primer restaurante disponible.
- El editor de platos permitía abrir un plato por su ID sin exigir que perteneciera al restaurante seleccionado.
- El panel de reputación podía conservar la pantalla anterior al cambiar el parámetro de restaurante; también guardaba su selección entre pestañas.

Cada pestaña guarda ahora su selección en `sessionStorage`. Al cambiar de restaurante o de cuenta, se crea una caché nueva y se desmontan las páginas, formularios, suscripciones y estados del panel anterior. Las respuestas tardías no pueden llenar el panel nuevo. Los selectores de agencia y el cierre de sesión usan el mismo mecanismo.

Cocina, ocupación y platos usan el restaurante activo. Las modificaciones de pedidos, fichas de clientes, sala, zonas, mesas y reputación incluyen el restaurante en sus filtros. Las consultas de fidelización conservan el filtro también al cargar los clientes vinculados.

El acceso a los datos sigue comprobándose en Supabase; guardar un ID en el navegador no concede permisos. No se cambiaron permisos, clientes, reservas, envíos, credenciales ni el flujo n8n.

## Verificación

- Nueve pruebas automáticas ejecutan el componente React de separación y el código de selección real: A → B → A, formulario pendiente, respuesta tardía, cambio de usuario, cierre de sesión, selección por pestaña, denegación/error de permisos cocina con dos restaurantes y selección de reputación tras cambiar de cuenta.
- Estas pruebas se añaden al CI existente, que también comprueba el flujo de reseñas.
- TypeScript y lint comprobados localmente.
- Comprobación real en Supabase bajo los roles autenticados de Hispanos Grill y la demo pública: **47 tablas/vistas por cuenta, cero registros ajenos**. Se ven registros propios en ambas cuentas (376 y 543 referencias agregadas, incluyendo vistas; no son clientes únicos).
- Intentos de modificar reservas, clientes y pedidos ajenos, y borrar reseñas ajenas, desde la cuenta de Hispanos: **cero filas afectadas**. Transacción revertida.
- Ninguna reserva referencia a un cliente de otro restaurante.
- La reserva de prueba sigue asignada a DEMOOOO; no se copia a otros restaurantes.

Las comprobaciones del navegador con una cuenta propietaria de agencia requieren su sesión iniciada. Las pruebas automáticas usan datos ficticios y no afirman que se haya realizado ese recorrido en una sesión de agencia de producción.

## Comprobación de Jose

Tras publicar y recargar el panel, seleccionar **DEMOOOO** en el selector de agencia. Abrir Reservas, Vista día, **09/09/2026** y filtro Todas. Debe aparecer **Jose · Prueba lista**, a las **11:00**, con **Ha venido**.

Al seleccionar otro restaurante, esa reserva no debe aparecer. Dos pestañas con restaurantes distintos deben mantener sus respectivas selecciones.

La prueba de reseñas continúa en modo test: puede llegar a n8n sin enviar WhatsApp real. La activación de WhatsApp mantiene sus requisitos pendientes de emisor, plantilla y prueba autorizada.
