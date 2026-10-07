# Fidelización — revisión visual V2

Capturas completas del estado UI/UX de la rama `codex/qa-loyalty-club` el 04/10/2026. Se tomaron en un servidor local con datos sintéticos y respuestas de prueba; no acreditan un despliegue ni una base de datos QA. Las capturas V1 permanecen en `../loyalty-visual-review/`.

Tamaños CSS: Android 360 × 732 px; iPhone 15 393 × 659 px. Cada PNG es de página completa. Los nombres con sufijos `android` e `iphone` indican el viewport usado.

| Nº | Pantalla / acción | Android | iPhone |
| --- | --- | --- | --- |
| 01 | QR público del restaurante: abre el club, no suma visitas | [PNG](01-qr-publico-android.png) | [PNG](01-qr-publico-iphone.png) |
| 02 | Entrada del cliente al club | [PNG](02-entrada-cliente-android.png) | [PNG](02-entrada-cliente-iphone.png) |
| 04 | Home: marca, puntos, progreso y acción principal | [PNG](04-home-cliente-android.png) | [PNG](04-home-cliente-iphone.png) |
| 07 | Recompensas disponibles | [PNG](07-recompensas-android.png) | [PNG](07-recompensas-iphone.png) |
| 09 | Confirmación previa a crear el QR, sin descuento | [PNG](09-confirmar-premio-android.png) | [PNG](09-confirmar-premio-iphone.png) |
| 10 | QR temporal de canje | [PNG](10-qr-canje-android.png) | [PNG](10-qr-canje-iphone.png) |
| 11 | Escáner del restaurante, cámara como acción principal | [PNG](11-escaner-android.png) | [PNG](11-escaner-iphone.png) |
| 11a | Alternativa de código manual desplegada | [PNG](11-codigo-manual-android.png) | — |
| 11b | Premio detectado | [PNG](11-premio-detectado-android.png) | [PNG](11-premio-detectado-iphone.png) |
| 12 | Confirmación del restaurante antes del débito | [PNG](12-confirmacion-restaurante-android.png) | [PNG](12-confirmacion-restaurante-iphone.png) |
| 13 | Canje completado | [PNG](13-canje-completado-android.png) | [PNG](13-canje-completado-iphone.png) |
| 14 | QR ya utilizado | [PNG](14-qr-usado-android.png) | [PNG](14-qr-usado-iphone.png) |
| 15 | QR caducado | [PNG](15-qr-caducado-android.png) | [PNG](15-qr-caducado-iphone.png) |
| 16 | QR de otro restaurante | [PNG](16-qr-otro-restaurante-android.png) | [PNG](16-qr-otro-restaurante-iphone.png) |
| 17 | QR personal de identificación | [PNG](17-qr-personal-android.png) | [PNG](17-qr-personal-iphone.png) |
| 17a | Cliente identificado, sin visita automática | [PNG](17-cliente-identificado-android.png) | [PNG](17-cliente-identificado-iphone.png) |
| 18 | Confirmación manual de visita | [PNG](18-confirmar-visita-android.png) | [PNG](18-confirmar-visita-iphone.png) |
| 18a | Visita registrada | [PNG](18-visita-registrada-android.png) | [PNG](18-visita-registrada-iphone.png) |
| 19 | Historial secundario desplegado | [PNG](19-historial-expandido-android.png) | [PNG](19-historial-expandido-iphone.png) |
| 21a | QR público presentado al escáner: rechazado | [PNG](21-qr-publico-rechazado-android.png) | [PNG](21-qr-publico-rechazado-iphone.png) |
| 21b | Puntos insuficientes al confirmar canje | [PNG](21-puntos-insuficientes-android.png) | [PNG](21-puntos-insuficientes-iphone.png) |

Wallet no aparece en la experiencia de cliente mientras la capacidad real no esté disponible. La pantalla del restaurante no muestra saldo actual ni nuevo saldo del canje porque las RPC actuales no devuelven esos datos; no se cambió el contrato para esta pasada visual. OTP/alta completa y cámara física requieren una prueba posterior en QA aislado.
