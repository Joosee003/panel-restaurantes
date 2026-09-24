<!-- BEGIN:gastrohelp-parent-context -->

# Contexto operativo obligatorio de GastroHelp

Cuando este repositorio esté abierto dentro de `GASTROHELP`, antes de cualquier cambio se deben leer y aplicar el `../AGENTS.md` y la documentación vigente de `../docs/` del proyecto padre. Esas reglas contienen el estado operativo, las decisiones y deprecaciones, los límites del producto y las restricciones de producción de GastroHelp; complementan las reglas técnicas de Next.js que aparecen debajo y prevalecen en cualquier cuestión operativa de GastroHelp.

Si el clon está abierto de forma aislada y no se puede acceder a ese contexto padre, se debe advertir explícitamente que **falta contexto operativo de GastroHelp** antes de realizar cambios relevantes. No se deben inferir decisiones actuales a partir de documentos históricos del repositorio aislado ni actuar sobre producción, Supabase, n8n, WhatsApp, Vercel o infraestructura sin recuperar ese contexto y la autorización necesaria.

<!-- END:gastrohelp-parent-context -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
