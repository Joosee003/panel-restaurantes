# Auditoría de producción del panel — 27/07/2026

## Resumen

El panel está publicado, conectado al repositorio oficial y responde correctamente en el dominio principal. La demo pública también responde, declara datos ficticios, utiliza `noindex, nofollow` y presenta el acceso como solo lectura.

La auditoría se implantó mediante el pull request número 1. La versión resultante se desplegó en producción y fue comprobada después de la publicación.

No se detectaron errores de ejecución en los registros de producción consultados tras el despliegue.

La auditoría automática de lint ha descubierto deuda técnica previa: 171 incidencias, divididas en 130 errores y 41 avisos. El proyecto construye correctamente; el lint se registra temporalmente como auditoría no bloqueante hasta corregir las incidencias por grupos.

## Inventario confirmado

### GitHub

- Repositorio: `Joosee003/panel-restaurantes`
- Visibilidad: pública
- Rama principal: `main`
- Pull request técnico: `#1`
- Estado del pull request: fusionado
- Commit actual auditado: `9e806092b0c4e8d809e5ddb3edd0a3ba878a9417`
- Mensaje: `Auditar producción y reforzar la seguridad del panel`

### Vercel

- Proyecto: `panel-restaurantes`
- ID: `prj_Rqlfs38eGVHBGlfqFWT9xUrVAGvA`
- Despliegue de producción: `dpl_AsyNkcvSU3G672nBhCSvFJpaCJpA`
- Estado: `READY`
- Rama: `main`
- Commit: `9e806092b0c4e8d809e5ddb3edd0a3ba878a9417`
- Dominio principal: `panel.gastrohelp.es`

GitHub, Vercel y el despliegue activo quedaron alineados en la misma versión.

## Rutas comprobadas

### `/`

- Responde HTTP 200.
- Resuelve hacia `/login`.
- Muestra el estado de comprobación de sesión.
- Incluye contacto por WhatsApp y correo.
- Incluye las nuevas cabeceras de seguridad.

### `/demo`

- Responde HTTP 200.
- Título: `Restaurante demo | GastroHelp`.
- Descripción: entorno público con datos ficticios.
- Robots: `noindex, nofollow`.
- No solicita registro.
- Declara que la sesión está aislada.
- Declara modo de solo lectura.
- Incluye reservas, clientes, reseñas, fidelización, rentabilidad, carta, QR y cocina como áreas demostradas.
- Incluye las nuevas cabeceras de seguridad.

## Tecnología confirmada

- Next.js 16.
- React 19.
- TypeScript.
- Tailwind 4.
- Supabase.
- TanStack Query.
- FullCalendar.
- Recharts.
- Generación de QR.

## Controles implantados

- `.env*` está excluido mediante `.gitignore`.
- El despliegue automático desde GitHub está activo.
- La demo está fuera del índice de buscadores.
- Vercel conserva despliegues anteriores utilizables para rollback.
- El dominio funciona con HTTPS.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` restringe cámara, micrófono y geolocalización.
- `X-Frame-Options: SAMEORIGIN`.
- `X-Powered-By` está desactivada.
- GitHub Actions ejecuta una auditoría de lint y guarda el informe como artefacto.
- La previsualización y el despliegue de producción terminaron con estado `READY`.
- No aparecieron errores de runtime en la comprobación posterior.

## Riesgos pendientes

### 1. Repositorio público

El repositorio es público. Todo archivo, commit e historial debe considerarse visible.

Acciones:

- no guardar secretos;
- no guardar exportaciones de clientes;
- no subir capturas con datos personales;
- revisar el historial si alguna credencial se mostró en el pasado;
- rotar cualquier clave que haya aparecido en capturas, chats o commits.

### 2. Seguridad real de la demo

La interfaz declara que las escrituras están bloqueadas desde la base de datos. Esta afirmación debe comprobarse mediante las políticas RLS, permisos y funciones de Supabase.

Acciones:

- probar intentos de escritura con la sesión demo;
- documentar las políticas que protegen las tablas;
- comprobar que la cuenta demo no puede cambiar de restaurante;
- comprobar que las funciones del servidor también validan el modo demo;
- revisar que no exista acceso a datos reales mediante consultas manipuladas.

### 3. Variables y proyectos de Supabase

No se ha verificado todavía qué proyecto es producción, qué variables usa Vercel, qué políticas RLS están activas ni cómo se realizan las copias de seguridad.

### 4. Deuda de lint

Resultado inicial:

- 171 incidencias;
- 130 errores;
- 41 avisos.

Grupos principales detectados:

- uso extendido de `any`;
- funciones utilizadas antes de declararse;
- llamadas que actualizan estado desde efectos;
- dependencias ausentes en hooks;
- imágenes sin optimización de Next.js;
- una carpeta antigua denominada `app copy` que también entra en el análisis.

El informe completo se guarda como artefacto de GitHub Actions en cada ejecución. El control es no bloqueante de manera temporal para no impedir cambios seguros que sí construyen correctamente. Debe pasar a bloqueante cuando la deuda llegue a cero.

Orden de corrección recomendado:

1. revisar y retirar `app copy` si es una copia obsoleta;
2. corregir errores de orden de declaración;
3. tipar utilidades compartidas y `safeQuery`;
4. corregir los efectos y hooks de clientes, alertas y rentabilidad;
5. tipar carta, productos, ocupación y ventas;
6. corregir avisos de imágenes y dependencias;
7. activar lint bloqueante.

## Resultado de la validación

- Pull request técnico fusionado correctamente.
- GitHub Actions genera el informe de lint.
- Previsualización de Vercel: `READY`.
- Producción de Vercel: `READY`.
- `/login`: operativo.
- `/demo`: operativo.
- Cabeceras de seguridad: activas.
- `noindex, nofollow` de la demo: conservado.
- Errores de runtime posteriores: ninguno detectado.

## Siguiente auditoría

La siguiente fase debe centrarse en Supabase:

1. identificar el proyecto de producción;
2. inventariar tablas, vistas, funciones, triggers y buckets;
3. revisar RLS por tabla;
4. comprobar el aislamiento por `restaurante_id`;
5. revisar la cuenta demo;
6. inventariar variables de Vercel sin revelar valores;
7. confirmar backups y procedimiento de restauración;
8. revisar webhooks y dependencias con n8n.
