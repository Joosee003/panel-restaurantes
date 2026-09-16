# Registro de cierre · 16 septiembre 2026

El cierre completo NO está acreditado. Esta entrega corrige fallos comprobados y distingue pruebas locales, observación de producción y comprobaciones pendientes.

## Referencia observada

- Repositorio: `Joosee003/panel-restaurantes`, producción `main`.
- Commit publicado al inicio: `9cad0489ccfa4ca5bcddaff39ee2e3018e535dc1`.
- Vercel: `panel-restaurantes`, despliegue `dpl_4RCNmaw7otTEPk6dfw4PdLLPesr1`, READY, dominio `panel.gastrohelp.es`.
- Next.js 16.3.4, React 19.2.1, Supabase JS 2.112.3; proyecto `gastrohelp-panel` (`yyiotkszobortppwiqal`), PostgreSQL 17, eu-west-1.
- Rama: `fix/technical-closure-20260916`. No se han usado clientes reales para pruebas ni realizado envíos reales.
- Supabase: 111 migraciones al inicio; única rama alojada `main`. Las pruebas usan una base local separada con catálogo sin datos privados y filas ficticias.
- WAHA: transporte implementado en el backend. Un canal registrado, desactivado y FAILED. No prueba el estado del contenedor de Hetzner.
- n8n: reseñas `gJEAvv5L445d69FS` activo con envío real deshabilitado; el nodo de respuesta no escribe. El backend sí llama `complete_visit_review_delivery` y verifica su resultado. Avisos `D0v3AmCPH7r3tPY3` activo; modo de prueba sin correo, modo real con SMTP. Prevalidación `jlC4ta7iiBYC1L6S` y preparación Evolution `NtTCdApEDVYYaoIm` inactivas. No se han activado, eliminado ni alterado rutas anteriores.
- Cron `gastrohelp-automation-dispatch`: cada minuto; cinco ejecuciones 08:06–08:10 UTC con estado succeeded. Esto no certifica recepción del webhook ni funcionamiento de una alerta.

## Registro de incidencias

| Incidencia / ámbito | Evidencia | Prioridad | Solución y prueba | Estado | Dependencia |
|---|---|---|---|---|---|
| Alta eliminada al fallar el correo | API anterior ejecutaba rollback tras error o resultado incierto | Alta | Instalación persistente, clave UUID, ledger y bloqueo SQL; invitación independiente. SQL y API probadas | Verificado localmente; publicación pendiente | Migración y despliegue |
| Pérdida de avance al recargar | Wizard anterior solo useState | Alta | Borrador por usuario y pestaña, 24 h, clave estable; borrado al cambiar sesión; prueba de desmontaje/recarga y segunda cuenta | Verificado localmente | Navegador privado real pendiente |
| Invitación presentada como enviada sin evidencia | pending/sent compartían descripción | Alta | Estados no solicitada, enviando, aceptada por proveedor, fallida e incierta. Reintento explícito con bloqueo y espera. No se equipara aceptación a entrega | Verificado localmente | Recepción real pendiente |
| Reenvío a cuenta creada | Cuenta podía existir tras fallo parcial | Alta | Recuperación de acceso solo a usuario vinculado y correo comprobado; página admite invite/recovery y rechaza enlace ausente, caducado o tipo indebido | Verificado localmente | Auth/SMTP real |
| Retorno al número común para reseñas | Dispatcher aceptaba null del canal propio y seguía ruta compartida | Alta | Bloquea con own_whatsapp_number_required; prueba de cero envíos | Verificado localmente | Publicación |
| Canal compartido contado como preparado | Indicadores de alta permitían sharedConnected | Media | Chatbot y reseñas requieren canal propio; se conserva información de la ruta anterior | Verificado localmente | Publicación |
| Datos personales en demo | API pública permitía reservas en webs es_demo; demo visible contiene entradas de origen no acreditado | Alta | Bloqueo 403 en API y formulario sustituido por aviso de solo lectura; cero escrituras en prueba. No se han borrado registros existentes | Corrección local verificada; revisión de datos pendiente | Clasificar entradas de demo con el titular |
| RLS, RPC y Storage | Tablas consultadas con RLS; asesores muestran avisos, incluidas funciones SECURITY DEFINER y protección de contraseñas filtradas desactivada | Alta | Pruebas locales de permisos en alta, reseñas y WAHA; no se ha demostrado toda la matriz de cliente/pedidos/cupones/archivos en sesiones reales | Pendiente | Auditoría completa por rol |
| Correo recibido y acceso inicial | No hay buzón de prueba autorizado ni sesión agencia en navegador | Alta | No se ha enviado a correos reales. Los mocks de transporte no prueban recepción | Bloqueado por acceso | Sesión agencia y buzón autorizado; configuración Auth/SMTP |
| Concurrencia PostgreSQL independiente | scripts/test-review-concurrent falla al arrancar: spawnSync node EINVAL al cambiar UID | Alta | Pruebas SQL secuenciales e idempotencia pasan; no se presenta PGlite como conexiones concurrentes independientes | Bloqueado por entorno | Entorno autorizado con PostgreSQL no root para probar también último hueco |
| Copia externa y recuperación | Catálogo de fixture no contiene datos ni Storage; no hay SSH/copia externa accesible | Alta | No se ha ejecutado una recuperación de producción; no hay RTO/RPO medidos | Bloqueado por acceso | Copias protegidas, Storage y Hetzner/n8n; destino aislado |
| WhatsApp real | Canal desactivado y flujo de reseñas con realEnabled=false | Alta | Sin escaneo, activación ni mensajes | Dependiente del número | Número propio y prueba real posterior |
| Meta, tarifas y web comercial | Excluidos por encargo | — | Sin cambios | Fuera de este cierre | — |

## Pruebas ejecutadas en esta sesión

Todas con datos ficticios y sin credenciales de producción. Fecha: 2026-09-16.

| Comando | Resultado | Alcance y límite |
|---|---|---|
| `node --test tests/*.test.mjs` antes de cambios | 221/221, 0 omitidas | Base de comparación |
| `node --test tests/*.test.mjs` tras cambios | 226/226, 0 omitidas | Dos antiguas pruebas de rollback se sustituyen por una de conservación; se añaden demo, recarga, número propio, enlaces Auth y reenvío seguro |
| `node --test tests/auth-invitation-links.test.mjs` | 2/2 | Token validado, limpieza URL, caducidad y tipo; transporte Auth simulado |
| `node scripts/test-agency-onboarding.mjs` | 11 comprobaciones | Dos configuraciones distintas; permisos, mismo UUID, conflicto de payload, correo fallido sin borrar alta, claim y resultado incierto |
| `node scripts/test-review-schema.mjs` | Passed | Funciones SQL reales del catálogo y migración; visitas, consentimiento, elegibilidad, permisos y deduplicación |
| `node scripts/test-natural-booking-confirmation.mjs` | 5 comprobaciones | Confirmación y corrección de reserva; backend SQL local |
| `node scripts/test-panel-service-hours.mjs` | 6 comprobaciones | Horarios del panel y disponibilidad SQL |
| `node scripts/test-waha-schema.mjs` | Passed | Sesiones, mensajes y deduplicación persistente SQL |
| `node scripts/test-review-http.mjs` | 5 comprobaciones | Next y API real local con RPC contra PGlite; transporte externo aislado |
| `node scripts/test-review-concurrent.mjs` | Bloqueado, salida 1 | No se omite ni se cuenta como aprobado |
| `node node_modules/typescript/bin/tsc --noEmit` | Sin errores | Tipos |
| `node node_modules/eslint/bin/eslint.js` | Sin errores | Código completo |
| `npm run build -- --webpack` | Correcto | Variables sintéticas; no conecta con producción |

Se ha ejecutado un recorrido continuo SQL local: alta, trigger de invitación, rol dueño, configuración, reserva pública idempotente, lectura de la reserva por su dueño, asistencia, consumo/puntos sin duplicar, reseña programada sin envío y métricas de agencia calculadas desde las filas persistidas. El paso del tiempo se prepara únicamente en la reserva ficticia. El recorrido obligatorio autenticado en navegador y con correo recibido NO se ha completado: esta prueba SQL no lo sustituye. Tampoco acreditan recuperación real, conversación de WhatsApp ni cobertura de todos los módulos existentes.

## Publicación y revisión visual

- Jose autoriza expresamente publicar en `Joosee003/panel-restaurantes`, comprobar la vista previa y desplegar después. La revisión automática anterior queda resuelta por esa autorización; no se cambiaron controles para sortearla.
- La sesión git local no tiene credenciales de escritura. Se publica mediante la conexión autenticada de GitHub en la PR [69](https://github.com/Joosee003/panel-restaurantes/pull/69). El hash del árbol remoto inicial `6a8bbe5b406b4097429af5efc56cb8a8841495bd` coincide exactamente con el local probado.
- Vista previa de aplicación `1c33044f93a5a945d80186e026dfe9a1721c28aa`, despliegue `dpl_GrkgWnQTzrRCFhbXaoytGsFd8Soj`, READY. Usa componentes reales con datos ficticios y transporte de alta simulado únicamente para la revisión visual. La evidencia SQL separada prueba persistencia real del backend local.
- Navegador: escritorio 1348 px y marco móvil de 390 px; sin desbordamiento horizontal (1348/1348 y 375/375 píxeles útiles). Dos configuraciones: reservas/chatbot y solo reputación. Avance, cambio de zona, volver, recarga, recuperación del borrador, resumen y resultado de correo incierto comprobados. Las capturas tienen datos ficticios.
- Corregidos los tonos morados observados en botones, indicadores y gráficos de agencia. Azul principal `#1d4ed8`, con referencia al logo vigente y al panel. Capturas: `gastrohelp-agencia-azul-20260916.jpg` y `gastrohelp-alta-movil-20260916.jpg`.
- Migración aplicada a Supabase: `20260916084425_resumable_agency_onboarding`. Se ajusta el nombre del archivo a la versión devuelta por el servidor. Verificación: RLS activo, ledger sin filas, anon/authenticated sin acceso a tabla ni a las tres RPC, service_role con permiso; funciones SECURITY INVOKER. Sin cuentas, reservas ni mensajes de prueba creados en producción.
- El asesor de seguridad conserva avisos anteriores: [extensiones en public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [RPC públicas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [RPC autenticadas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) y [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). La tabla nueva deniega acceso al navegador deliberadamente; no necesita una política que lo abra.
- Publicación de la aplicación en producción: pendiente de integrar la PR tras esta revisión. La migración es compatible con el código anterior.

## Operación del alta

1. Agencia → Puesta en marcha → Añadir restaurante.
2. Completar datos y elegir únicamente servicios contratados. El borrador se guarda en esa pestaña por 24 horas; volver o recargar conserva la solicitud.
3. Revisar y crear. Si se pierde la conexión, repetir recupera la misma solicitud. No abrir otra alta para resolver un fallo de correo.
4. La ficha distingue restaurante creado y estado de invitación. «Reintentar invitación» actúa sobre el mismo restaurante; si el proveedor tiene resultado incierto, comprobar el buzón antes de repetir.
5. Continuar configuración: horarios, capacidad, carta, enlaces y datos legales reales. La reserva pública permanece desactivada hasta configurarla. WhatsApp aparece pendiente y no bloquea el resto.
6. Probar acceso del responsable y servicios antes de entregar. Proveedor aceptado no significa correo recibido.

## Vuelta atrás

Publicar el commit inicial permite retirar el código. La migración es aditiva y no elimina filas existentes: no revertir ni borrar su ledger o las invitaciones creadas. Nunca restaurar sobre producción. Conservar solicitudes e instalaciones aun si hay que corregir después la entrega de correo.

## Continuación exacta

A. Número: vincular el propio de cada restaurante, validar recepción y salida, separación de sesiones, conversación real, entrega y reseña; mantener fuera mensajes históricos y solicitudes antiguas.

B. Otros: integración y verificación posterior del despliegue; sesión agencia y buzón de prueba; matriz completa por rol; recorrido obligatorio continuo; concurrencia con PostgreSQL independiente y último hueco; clasificación de entradas antiguas de demo; acceso a Hetzner y copias para restauración aislada completa; SMTP y aspecto de correos; disparo automático de alerta; mediciones antes/después de recorridos lentos. No están cerrados ni dependen físicamente de WhatsApp.
