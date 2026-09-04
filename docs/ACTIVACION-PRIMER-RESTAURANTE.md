# Activación del primer restaurante real

Este documento separa lo que puede prepararse con antelación de las acciones que escriben datos reales o cambian servicios publicados.

## 1. Datos obligatorios

- [ ] Titular o razón social
- [ ] NIF/CIF
- [ ] Domicilio legal
- [ ] Email legal y de privacidad
- [ ] Teléfono operativo
- [ ] Dirección pública correcta
- [ ] Horarios de comida y cena
- [ ] Aforo y capacidad por mesa
- [ ] Política de cambios, cancelaciones y no presentación
- [ ] Plazo de conservación de datos revisado

No activar reservas públicas, WhatsApp en modo `live` ni dominio propio si falta alguno de estos datos.

## 2. Accesos y aislamiento

- [ ] Crear el restaurante desde el alta administrativa
- [ ] Asignar solo los usuarios autorizados
- [ ] Comprobar que un usuario ordinario solo ve ese restaurante
- [ ] Comprobar que no puede cambiar módulos ni acceder a Admin
- [ ] Comprobar que la cuenta demo no ve el restaurante real
- [ ] Confirmar que no hay secretos en código, capturas, Notion ni GitHub

## 3. Reservas

- [ ] Cargar horarios, duración, aforo, mesas y bloqueos
- [ ] Crear una reserva real desde el formulario público
- [ ] Comprobar restaurante, fecha, hora, personas, mesa y estado en el panel
- [ ] Cambiar la reserva desde el enlace del cliente
- [ ] Comprobar el cambio en el panel
- [ ] Cancelar la reserva desde el enlace del cliente
- [ ] Comprobar la cancelación en el panel
- [ ] Revisar los registros de Vercel y Supabase tras la prueba

## 4. WhatsApp

- [ ] Cargar teléfono, dirección, horarios y política del restaurante
- [ ] Mantener `mode: pilot` durante la primera conversación
- [ ] Confirmar que el router solo admite el remitente acordado
- [ ] Recorrer horarios, dirección, carta, disponibilidad y reserva
- [ ] Confirmar que el piloto devuelve `test_only`
- [ ] Comprobar que no cambió el recuento de reservas
- [ ] Cambiar a `live` solo con autorización de Jose en ese momento
- [ ] Crear una reserva real desde WhatsApp
- [ ] Cambiarla y cancelarla desde WhatsApp
- [ ] Comprobar los tres estados en el panel
- [ ] Volver a `pilot` si aparece cualquier diferencia

## 5. Carta QR y Camarero digital

- [ ] Publicar una carta con token válido de 32 caracteres
- [ ] Crear categorías y productos activos
- [ ] Crear zonas y mesas
- [ ] Renovar el acceso QR de una mesa durante la prueba atendida
- [ ] Abrir el QR en un móvil
- [ ] Comprobar idioma, búsqueda, alérgenos, precios y fotos
- [ ] Enviar un pedido de prueba
- [ ] Comprobarlo en cocina y en el panel
- [ ] Cerrar la mesa y comprobar el importe cobrado
- [ ] Invalidar el acceso de prueba al terminar

## 6. Dominio y textos legales

- [ ] Añadir dominio y `www` en Vercel
- [ ] Configurar DNS y comprobar HTTPS
- [ ] Revisar portada, carta, reservas y páginas legales
- [ ] Revisar `robots.txt` y `sitemap.xml`
- [ ] Confirmar que no hay analítica ni scripts opcionales sin elección previa

## 7. Copias y recuperación

- [ ] Pasar Supabase a Pro antes de cobrar al restaurante
- [ ] Activar y comprobar las copias diarias
- [ ] Activar la protección contra contraseñas filtradas
- [ ] Preparar una copia lógica externa cifrada
- [ ] Registrar fecha, responsable y ubicación de la copia
- [ ] Restaurar una copia en un entorno separado y comprobar reservas, clientes y configuración
- [ ] Documentar el tiempo real de recuperación

## 8. Cierre

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Auditoría de dependencias de producción sin vulnerabilidades
- [ ] Despliegue de Vercel en estado `READY`
- [ ] Sin errores nuevos de Vercel
- [ ] Sin avisos nuevos de seguridad de Supabase
- [ ] Retirar el flujo antiguo de n8n
- [ ] Rotar su credencial antigua
- [ ] Guardar el resultado final en Notion
