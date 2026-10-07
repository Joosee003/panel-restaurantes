# Fidelización — revisión visual del estado actual

Capturas del 4 de octubre de 2026 de `codex/qa-loyalty-club`. Se ha renderizado la interfaz actual en un servidor local con respuestas sintéticas para poder mostrar los estados sin tocar QA, producción, datos reales ni enviar SMS. No son pruebas de una base de datos desplegada ni de cámara física. Los tamaños indicados son anchos CSS de viewport: Android **360 px** e iPhone 15 **393 px**. Algunas imágenes muestran una sección completa de la página para que el texto sea legible.

Abre cada enlace para revisar la captura a tamaño completo. Las variantes adicionales de una misma pantalla aparecen en la misma fila.

| Nº | Pantalla | Acción representada | Quién | Android · 360 px | iPhone 15 · 393 px |
| --- | --- | --- | --- | --- | --- |
| 01 | QR público / entrada al club | Material QR público del restaurante; lleva a `/club/[slug]`, no suma visitas | Restaurante | [01-qr-publico-android.png](loyalty-visual-review/01-qr-publico-android.png) | [01-qr-publico-iphone.png](loyalty-visual-review/01-qr-publico-iphone.png) |
| 02 | Cliente nuevo | Entrada con teléfono y consentimiento; después, completar perfil | Cliente | [02-entrada-cliente-nuevo-android.png](loyalty-visual-review/02-entrada-cliente-nuevo-android.png)<br>[02-registro-perfil-nuevo-android.png](loyalty-visual-review/02-registro-perfil-nuevo-android.png) | [02-entrada-cliente-nuevo-iphone.png](loyalty-visual-review/02-entrada-cliente-nuevo-iphone.png)<br>[02-registro-perfil-nuevo-iphone.png](loyalty-visual-review/02-registro-perfil-nuevo-iphone.png) |
| 03 | Login existente | Introducir el código OTP solicitado; no se envió un SMS real | Cliente | [03-login-cliente-existente-otp-android.png](loyalty-visual-review/03-login-cliente-existente-otp-android.png) | [03-login-cliente-existente-otp-iphone.png](loyalty-visual-review/03-login-cliente-existente-otp-iphone.png) |
| 04 | Home del cliente | Resumen principal del club | Cliente | [04-home-cliente-android.png](loyalty-visual-review/04-home-cliente-android.png) | [04-home-cliente-iphone.png](loyalty-visual-review/04-home-cliente-iphone.png) |
| 05 | Puntos actuales | Saldo visible en el área del cliente | Cliente | [05-puntos-actuales-android.png](loyalty-visual-review/05-puntos-actuales-android.png) | [05-puntos-actuales-iphone.png](loyalty-visual-review/05-puntos-actuales-iphone.png) |
| 06 | Progreso al siguiente premio | Avance y puntos que faltan | Cliente | [06-progreso-siguiente-premio-android.png](loyalty-visual-review/06-progreso-siguiente-premio-android.png) | [06-progreso-siguiente-premio-iphone.png](loyalty-visual-review/06-progreso-siguiente-premio-iphone.png) |
| 07 | Recompensas | Listado de premios y costes | Cliente | [07-listado-recompensas-android.png](loyalty-visual-review/07-listado-recompensas-android.png) | [07-listado-recompensas-iphone.png](loyalty-visual-review/07-listado-recompensas-iphone.png) |
| 08 | Premio disponible | Recompensa alcanzada con el saldo actual | Cliente | [08-premio-disponible-android.png](loyalty-visual-review/08-premio-disponible-android.png) | [08-premio-disponible-iphone.png](loyalty-visual-review/08-premio-disponible-iphone.png) |
| 09 | Antes de generar el QR | Botón de la recompensa antes de pulsar «Generar QR de canje» | Cliente | [09-previo-generar-qr-android.png](loyalty-visual-review/09-previo-generar-qr-android.png) | [09-previo-generar-qr-iphone.png](loyalty-visual-review/09-previo-generar-qr-iphone.png) |
| 10 | QR temporal de canje | Modal con el QR creado para mostrar al restaurante | Cliente | [10-qr-canje-android.png](loyalty-visual-review/10-qr-canje-android.png) | [10-qr-canje-iphone.png](loyalty-visual-review/10-qr-canje-iphone.png) |
| 11 | Escáner del restaurante | Entrada de código/cámara y detalle de un QR detectado, aún sin descontar puntos | Restaurante | [11-escaner-restaurante-android.png](loyalty-visual-review/11-escaner-restaurante-android.png)<br>[11-qr-detectado-android.png](loyalty-visual-review/11-qr-detectado-android.png) | [11-escaner-restaurante-iphone.png](loyalty-visual-review/11-escaner-restaurante-iphone.png)<br>[11-qr-detectado-iphone.png](loyalty-visual-review/11-qr-detectado-iphone.png) |
| 12 | Confirmación previa | Última comprobación de cliente, premio y puntos antes de confirmar | Restaurante | [12-confirmacion-restaurante-android.png](loyalty-visual-review/12-confirmacion-restaurante-android.png) | [12-confirmacion-restaurante-iphone.png](loyalty-visual-review/12-confirmacion-restaurante-iphone.png) |
| 13 | Canje completado | Mensaje de confirmación y QR inutilizado | Restaurante | [13-canje-completado-android.png](loyalty-visual-review/13-canje-completado-android.png) | [13-canje-completado-iphone.png](loyalty-visual-review/13-canje-completado-iphone.png) |
| 14 | QR ya usado | Rechazo al intentar comprobar un QR usado | Restaurante | [14-qr-usado-android.png](loyalty-visual-review/14-qr-usado-android.png) | [14-qr-usado-iphone.png](loyalty-visual-review/14-qr-usado-iphone.png) |
| 15 | QR caducado | Rechazo y petición de un QR nuevo | Restaurante | [15-qr-caducado-android.png](loyalty-visual-review/15-qr-caducado-android.png) | [15-qr-caducado-iphone.png](loyalty-visual-review/15-qr-caducado-iphone.png) |
| 16 | QR de otro restaurante | Rechazo de QR no válido para el restaurante actual | Restaurante | [16-qr-otro-restaurante-android.png](loyalty-visual-review/16-qr-otro-restaurante-android.png) | [16-qr-otro-restaurante-iphone.png](loyalty-visual-review/16-qr-otro-restaurante-iphone.png) |
| 17 | QR personal del cliente | Mostrar el QR personal e identificar al cliente, sin registrar visita por el escaneo | Cliente y restaurante | [17-identificacion-qr-personal-android.png](loyalty-visual-review/17-identificacion-qr-personal-android.png) | [17-qr-personal-cliente-iphone.png](loyalty-visual-review/17-qr-personal-cliente-iphone.png)<br>[17-identificacion-qr-personal-iphone.png](loyalty-visual-review/17-identificacion-qr-personal-iphone.png) |
| 18 | Visita manual | Confirmar la visita desde el restaurante y ver el resultado | Restaurante | [18-registro-manual-visita-android.png](loyalty-visual-review/18-registro-manual-visita-android.png)<br>[18-visita-registrada-android.png](loyalty-visual-review/18-visita-registrada-android.png) | [18-registro-manual-visita-iphone.png](loyalty-visual-review/18-registro-manual-visita-iphone.png)<br>[18-visita-registrada-iphone.png](loyalty-visual-review/18-visita-registrada-iphone.png) |
| 19 | Historial | Movimientos de puntos/visitas/canjes del cliente y listado de canjes del restaurante | Cliente y restaurante | [19-historial-cliente-android.png](loyalty-visual-review/19-historial-cliente-android.png) | [19-historial-cliente-iphone.png](loyalty-visual-review/19-historial-cliente-iphone.png)<br>[19-historial-canjes-restaurante-iphone.png](loyalty-visual-review/19-historial-canjes-restaurante-iphone.png) |
| 20 | Wallet | Zona actual desactivada; no se simula Apple Wallet ni Google Wallet | Cliente | [20-wallet-desactivado-android.png](loyalty-visual-review/20-wallet-desactivado-android.png) | [20-wallet-desactivado-iphone.png](loyalty-visual-review/20-wallet-desactivado-iphone.png) |
| 21 | Estados adicionales | Club sin recompensas, error de consentimiento y rechazo del QR público en el escáner | Cliente y restaurante | [21-club-sin-recompensas-android.png](loyalty-visual-review/21-club-sin-recompensas-android.png)<br>[21-qr-publico-rechazado-android.png](loyalty-visual-review/21-qr-publico-rechazado-android.png) | [21-error-consentimiento-iphone.png](loyalty-visual-review/21-error-consentimiento-iphone.png) |

**Origen de las 51 capturas.** Se reutilizaron siete imágenes locales previas, copiadas sin alterar su contenido: `01-qr-publico-android.png`, `02-entrada-cliente-nuevo-android.png`, `02-entrada-cliente-nuevo-iphone.png`, `04-home-cliente-android.png`, `10-qr-canje-android.png`, `21-error-consentimiento-iphone.png` y `21-qr-publico-rechazado-android.png`. Las otras 44 se generaron ahora. Las capturas previas del escáner y sus resultados se volvieron a generar para corregir el encuadre; por eso cuentan entre las 44 nuevas.

## Recorrido principal, pantalla por pantalla

### 01 · QR público

![QR público del restaurante](loyalty-visual-review/01-qr-publico-iphone.png)

### 02 · Alta del cliente

![Entrada de cliente nuevo](loyalty-visual-review/02-entrada-cliente-nuevo-iphone.png)

![Registro de perfil](loyalty-visual-review/02-registro-perfil-nuevo-iphone.png)

### 03 · Login existente

![Login OTP](loyalty-visual-review/03-login-cliente-existente-otp-iphone.png)

### 04 · Home del cliente

![Home del cliente](loyalty-visual-review/04-home-cliente-iphone.png)

### 05 · Puntos actuales

![Puntos actuales](loyalty-visual-review/05-puntos-actuales-iphone.png)

### 06 · Progreso al siguiente premio

![Progreso hasta el siguiente premio](loyalty-visual-review/06-progreso-siguiente-premio-iphone.png)

### 07 · Recompensas

![Listado de recompensas](loyalty-visual-review/07-listado-recompensas-iphone.png)

### 08 · Premio disponible

![Premio disponible](loyalty-visual-review/08-premio-disponible-iphone.png)

### 09 · Antes de generar el QR

![Botón para generar QR](loyalty-visual-review/09-previo-generar-qr-iphone.png)

### 10 · QR temporal de canje

![QR temporal de canje](loyalty-visual-review/10-qr-canje-iphone.png)

### 11 · Escáner y QR detectado

![Escáner del restaurante](loyalty-visual-review/11-escaner-restaurante-iphone.png)

![QR de canje detectado](loyalty-visual-review/11-qr-detectado-iphone.png)

### 12 · Confirmación del restaurante

![Confirmación previa al descuento](loyalty-visual-review/12-confirmacion-restaurante-iphone.png)

### 13 · Canje completado

![Canje completado](loyalty-visual-review/13-canje-completado-iphone.png)

### 14 · QR ya usado

![QR ya utilizado](loyalty-visual-review/14-qr-usado-iphone.png)

### 15 · QR caducado

![QR caducado](loyalty-visual-review/15-qr-caducado-iphone.png)

### 16 · QR de otro restaurante

![QR de otro restaurante](loyalty-visual-review/16-qr-otro-restaurante-iphone.png)

### 17 · QR personal e identificación

![QR personal del cliente](loyalty-visual-review/17-qr-personal-cliente-iphone.png)

![Cliente identificado en restaurante](loyalty-visual-review/17-identificacion-qr-personal-iphone.png)

### 18 · Registro manual de visita

![Confirmación de visita manual](loyalty-visual-review/18-registro-manual-visita-iphone.png)

![Visita registrada](loyalty-visual-review/18-visita-registrada-iphone.png)

### 19 · Historial

![Historial del cliente](loyalty-visual-review/19-historial-cliente-iphone.png)

![Historial de canjes del restaurante](loyalty-visual-review/19-historial-canjes-restaurante-iphone.png)

### 20 · Wallet desactivado

![Zona Wallet desactivada](loyalty-visual-review/20-wallet-desactivado-iphone.png)

### 21 · Estados adicionales

![Club sin recompensas](loyalty-visual-review/21-club-sin-recompensas-android.png)

![Error de consentimiento](loyalty-visual-review/21-error-consentimiento-iphone.png)

![QR público rechazado por el escáner](loyalty-visual-review/21-qr-publico-rechazado-android.png)

## Límites de esta entrega visual

- No hay una pantalla adicional de confirmación del cliente antes de generar el QR: el estado real es la tarjeta y su botón de la captura 09. La confirmación que descuenta puntos corresponde al restaurante (12).
- No se ha capturado un SMS/OTP real, una cámara física leyendo el código, ni Wallet operativo. La captura 03 muestra el formulario de acceso, no la recepción del mensaje.
- No hay una captura separada del QR personal del cliente en Android; sí se incluye su identificación en el escáner Android y el QR personal visible en iPhone.
- Las capturas representan los estados de interfaz con datos sintéticos, no una ejecución contra QA desplegado.
