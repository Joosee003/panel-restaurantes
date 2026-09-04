# Copias y recuperación

## Estado actual

- El proyecto de Supabase está en el plan Free.
- No dispone de copias programadas ni de restauración desde el panel.
- Supabase recomienda exportar con frecuencia los proyectos Free y guardar la copia fuera del proveedor.
- Las copias de base de datos no incluyen los archivos de Storage; esos objetos necesitan una copia separada.

Documentación oficial:

- [Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

## Medida obligatoria antes de cobrar

- [ ] Pasar a Supabase Pro
- [ ] Comprobar que aparece una copia diaria
- [ ] Confirmar la retención de 7 días
- [ ] Mantener además una copia lógica cifrada fuera de Supabase
- [ ] Copiar por separado los archivos de Storage
- [ ] Probar una restauración en un proyecto separado

## Copia lógica externa

Requisitos:

- Supabase CLI y Docker en un equipo de confianza
- Cadena de conexión del Session pooler
- Carpeta local cifrada o destino externo cifrado
- Variable temporal `GASTROHELP_DB_URL`; nunca guardar la cadena en GitHub, Notion, logs ni archivos del proyecto

Generar tres archivos separados:

```bash
supabase db dump --db-url "$GASTROHELP_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$GASTROHELP_DB_URL" -f schema.sql
supabase db dump --db-url "$GASTROHELP_DB_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

Al terminar:

- [ ] Confirmar que los tres comandos terminaron con código 0
- [ ] Cifrar los tres archivos antes de subirlos
- [ ] Guardar una suma SHA-256 de cada archivo
- [ ] Registrar fecha, responsable, destino y periodo de conservación
- [ ] Borrar las copias locales sin cifrar de forma segura
- [ ] Retirar la variable temporal de la sesión

## Prueba de restauración

La restauración siempre se prueba en un proyecto separado. No se prueba sobre producción.

- [ ] Crear el proyecto de destino después de confirmar su coste
- [ ] Comprobar la versión de Postgres y las extensiones activas
- [ ] Restaurar roles, esquema y datos en ese orden
- [ ] Detenerse ante el primer error
- [ ] Comprobar usuarios, restaurantes, reservas, clientes, módulos, funciones, triggers y políticas RLS
- [ ] Comprobar el aislamiento entre dos restaurantes
- [ ] Comprobar la cuenta demo en modo de solo lectura
- [ ] Comprobar una reserva, un cambio y una cancelación
- [ ] Registrar el tiempo empleado y cualquier paso manual
- [ ] Eliminar el proyecto temporal después de autorizar el borrado

## Criterio de cierre

La copia no se considera válida hasta que una restauración separada termine sin errores y las comprobaciones de acceso y datos pasen.
