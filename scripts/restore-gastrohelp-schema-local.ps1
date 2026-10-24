$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$schema = Join-Path $root 'local-schema\gastrohelp-schema-only.sql'
$log = Join-Path $root 'local-schema\schema-restore.log'
$psql = 'C:\Users\Usuario\Documents\ChatGPT\GASTROHELP\local-only\pg17\pgsql\bin\psql.exe'
if (-not (Test-Path -LiteralPath $psql)) { throw 'PostgreSQL 17 psql is unavailable' }

Push-Location $root
try {
  & node (Join-Path $PSScriptRoot 'check-local-schema.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Schema-only inspection failed; refusing restore' }
  & node (Join-Path $PSScriptRoot 'assemble-local-schema.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Schema-only assembly failed; refusing restore' }

  # All connections in this script are fixed to the isolated local stack.
  $env:PGPASSWORD = 'postgres'
  $env:PGOPTIONS = '-c client_min_messages=error'
  $local = @('-X', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1')
  $existing = & $psql @local -Atc "select to_regclass('public.restaurantes') is not null"
  if ($LASTEXITCODE -ne 0) { throw 'Local PostgreSQL is unavailable' }
  if ($existing -eq 't') { throw 'Local GastroHelp schema already exists; refusing duplicate restore' }

  & $psql @local -f $schema *> $log
  if ($LASTEXITCODE -ne 0) { throw 'Local schema restore failed; inspect ignored local-schema/schema-restore.log' }

  & $psql @local -Atc "select to_regclass('public.restaurantes'),to_regclass('public.clientes'),to_regclass('public.reservas'),(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crear_reserva_manual')"
  if ($LASTEXITCODE -ne 0) { throw 'Local schema verification query failed' }
  Write-Output 'GastroHelp schema restored only to 127.0.0.1:54322.'
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
  Pop-Location
}
