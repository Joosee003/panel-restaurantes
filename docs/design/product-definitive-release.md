# GastroHelp — entrega del sistema de servicio

Fecha: 26/09/2026. Solo frontend/UI/UX, rama `codex/gastrohelp-product-definitive`.

## Dirección implementada

Hoy es una superficie continua de agenda temporal y pedidos por mesa, con acciones pendientes integradas y métricas secundarias. Reservas usa filas densas con detalle bajo demanda, manteniendo Vista día como entrada y Calendario/Semana/Lista/Bloqueos. Clientes prioriza CRM y ficha cronológica con rail estable. Sala usa mesas/zonas reales de sus consultas, sin plano físico inventado. Reputación, métricas, rentabilidad, fidelización, carta, pedidos y ajustes adoptan el lenguaje compartido progresivamente.

La app cliente mantiene el nombre, logo y colores configurados del restaurante, saldo/progreso, reservas, premios, cupones, perfil y navegación existente. No cambia ninguna regla de puntos ni canje.

## Puntos de retorno locales

- Antes de Turno vivo: `codex/return-panel-pre-turno`, commit `3187d1f2888fde73281860130e19913b0ae9290b`.
- Turno vivo v1: `codex/return-turno-vivo-v1`, commit `699e9a225f2ff562fbad3d3e71cd10ccaccdf1b2`.
- Composición refinada: `docs/design/service-direction-reference.png`, conservada sin edición en esta rama.
- Para volver localmente: con árbol limpio, `git switch codex/return-turno-vivo-v1` o `git switch codex/return-panel-pre-turno`. No usar reset destructivo. Cambiar de rama no modifica ningún deployment.
- Producción observada antes de esta Preview mediante `vercel inspect`: `dpl_BXhSwhd5Vr19stnFskJPRYfqwxHN`, dominio `panel.gastrohelp.es`. Es evidencia externa de esta fecha; difiere de la referencia histórica del contexto padre. No se cambia ni se promueve ningún deployment productivo.
- `dpl_Fmc7QkfeVwj85hY2LxreDhVyELTc` se conserva como referencia histórica solicitada; no se elimina ni reutiliza como si fuera necesariamente la producción actual.

## Frontera técnica

Consultas, efectos, mutaciones, validaciones, server actions, contratos, guards, selección de restaurante, Auth, módulos, RLS, RPC, Storage y frecuencias Realtime/polling conservados. Sin cambios en API/lib/servicios compartidos/Supabase/n8n/Meta/WhatsApp/infraestructura. Sin dependencias nuevas. El reloj de UI actualiza solo la presentación.

CSS nuevo del panel acotado a `.gh-product-shell`/`.gh-product-scope`; CSS Modules por superficie y para `/c/[token]`. Web pública, La Reserva, legales y agencia fuera del bloque no reciben nuevos selectores globales. No cambia `globals.css`.

## Verificación

- Lint, build de producción local, tipos y contratos. Resultados detallados de la suite y baseline en `product-definitive-functional-baseline.md`.
- Comparación visual, breakpoints y estados: `../../design-qa.md`.
- Arneses, capturas y datos sintéticos exclusivamente en `GASTROHELP/local-only/product-definitive/`, fuera del repo y del deployment. No existe ruta temporal de QA en `app/`.
- El adaptador local ejecuta las páginas reales pero no reproduce Supabase ni acredita RLS, deduplicación, concurrencia, capacidad o contabilidad de puntos. No interpretar sus mutaciones en memoria como QA conectada.
- La demo existente llama a `refresh_demo_dates` al entrar. No utilizarla como comprobación supuestamente de solo lectura del backend. No se altera ese comportamiento dentro de esta tarea; para QA conectada usar sesión autorizada y no guardar datos reales.
- Preview se crea sin `--prod`, sin push, sin alias ni dominios nuevos. El ID/URL exactos se entregan como resultado del CLI; producción permanece fuera de alcance.

## Riesgos existentes no corregidos

- Cuatro fallos históricos de aislamiento; ver nombres exactos en el baseline. No se silencian.
- Búsqueda textual de Clientes puede coincidir por el teléfono vacío normalizado; no se modifica la función.
- Dashboard no carga mesa/asistencia de reserva en su DTO. No se inventa una unión de sala ni se presenta un retraso como estado del negocio.
- Sala conserva selección inicial de franja y semántica de ocupación/atendida; no infiere nueva fase del plato.
- App cliente: la recompensa objetivo puede ser la siguiente no alcanzada mientras el badge «Canjeable» depende de otra recompensa disponible. Es comportamiento previo, no se cambia su cálculo en esta tarea.
- Interiores complejos de `LevelExperience`, `ScratchCoupon`, onboarding/enlace inválido, impresión/cobro, formularios y configuración WhatsApp conservados por seguridad. No se amplían capacidades para mejorar capturas.

La validación visual local no autoriza un despliegue productivo. Para producción futura hace falta aprobación expresa y QA conectada específica.
