# Cierre operativo de GastroHelp — 11/08/2026

## Estado confirmado

- Repositorio: `Joosee003/panel-restaurantes`.
- Rama de producción: `main`.
- Commit desplegado: `06afb2e999756c13fb823aab1760cc6f352f9424`.
- Pull request de cierre: `#27`.
- Producción: `https://panel.gastrohelp.es`.
- Vercel: despliegue `dpl_3Vmf5UsHoW9gkQRmqMFcF7Xp2eRR`, estado `READY`.
- Supabase: proyecto `yyiotkszobortppwiqal`.
- n8n: flujo `wEhIpYsLyJt8wmDf`, publicado con la versión `35e536e0-59c5-4d89-9471-34c9c87f3468`.

## Pruebas realizadas en producción

- La portada y el acceso responden con HTTP 200.
- La página pública de opiniones de Hispanos Grill responde con HTTP 200.
- Las reservas de Hispanos Grill están desactivadas y la API devuelve `BOOKING_NOT_AVAILABLE`.
- La web pública de `la-reserva-demo` responde con HTTP 200.
- La disponibilidad pública de la demo devolvió nueve horarios.
- Se creó una reserva ficticia en la demo.
- Su enlace privado mostró únicamente esa reserva.
- La hora se cambió de 20:00 a 20:30.
- La reserva se canceló desde el enlace privado.
- La otra reserva usada durante la prueba se dejó cancelada directamente en la demo.
- Los tokens de gestión inventados no muestran datos de reservas ni clientes.
- El límite de peticiones permite dos solicitudes y bloquea la tercera en la prueba configurada.
- Las funciones sensibles de reserva no pueden ejecutarse con los roles `anon` ni `authenticated`; solo con `service_role`.
- `npm audit --omit=dev` termina con cero avisos.
- La compilación de Next.js termina correctamente.

## Controles multi-restaurante

- Las consultas privadas parten del restaurante asignado a la sesión.
- Las funciones sensibles validan `restaurante_id` en el servidor.
- Las acciones de enlaces privados usan el token de la ruta, no valores enviados por el formulario.
- Cancelar y cambiar una reserva se realiza mediante funciones privadas.
- El cambio de hora vuelve a comprobar la disponibilidad antes de guardar.
- Las acciones privadas tienen límite por token.
- La demo mantiene las escrituras bloqueadas mediante RLS.

## WhatsApp y opiniones

- El flujo multi-restaurante está activo.
- El remitente se relaciona con `feedback_whatsapp` del restaurante.
- Un responsable con un restaurante solo puede consultar ese restaurante.
- La cuenta de agencia puede seleccionar entre los restaurantes disponibles.
- Las confirmaciones y estados de WhatsApp se ignoran para no abrir el chatbot.
- Las opiniones entregadas se guardan por restaurante en los datos estáticos del flujo.
- En Supabase existen 14 alertas pendientes de Hispanos Grill y no existen alertas duplicadas por opinión y tipo.

Pendiente de comprobación manual:

1. consultar las últimas ejecuciones desde la pantalla de n8n;
2. enviar `reseñas` desde el teléfono del responsable de Hispanos Grill;
3. confirmar que una segunda consulta no repite las opiniones entregadas;
4. identificar en Meta el token anterior y retirarlo sin tocar el token usado por n8n.

## Recuperación

### Código

1. Abrir el proyecto `panel-restaurantes` en Vercel.
2. Entrar en **Deployments**.
3. Seleccionar el último despliegue correcto anterior.
4. Usar **Promote to Production**.
5. Confirmar que `https://panel.gastrohelp.es` responde.

No eliminar ramas, commits ni despliegues antes de confirmar la recuperación.

### Base de datos

1. Abrir Supabase y seleccionar `gastrohelp-panel`.
2. Entrar en **Database > Backups**.
3. Comprobar la fecha y el alcance del respaldo disponible.
4. Restaurar primero en un entorno separado cuando sea posible.
5. Probar login, aislamiento por restaurante, reservas y opiniones antes de apuntar producción.

Las migraciones hasta `20260809080242_fix_demo_readonly_rls` constan aplicadas en producción.

### n8n

1. No despublicar el flujo activo durante una incidencia.
2. Abrir el historial de versiones del flujo.
3. Volver a la versión `35e536e0-59c5-4d89-9471-34c9c87f3468` si un cambio posterior rompe WhatsApp.
4. Comprobar una ejecución real antes de dar el servicio por recuperado.

### Meta

No retirar un token sin comprobar antes cuál usa n8n. Tras cambiarlo:

1. actualizar la credencial de WhatsApp en n8n;
2. ejecutar una prueba;
3. confirmar recepción y respuesta;
4. retirar únicamente el token sustituido.

## Accesos que nunca deben guardarse en GitHub

- contraseñas;
- códigos de autenticación;
- tokens de Meta;
- claves privadas de Supabase;
- credenciales de n8n;
- datos o exportaciones de clientes.

## Mantenimiento

- Revisar errores de n8n una vez por semana.
- Revisar avisos de Supabase y dependencias una vez al mes.
- Probar una reserva y su enlace privado después de cambios en reservas.
- Probar un usuario por restaurante después de cambios de permisos.
- Conservar un despliegue correcto de Vercel como vuelta atrás.
