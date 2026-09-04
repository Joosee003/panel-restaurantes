-- La función pública de carta solo acepta cartas activas y tokens de 32
-- caracteres. Los datos históricos de la demo conservaban el estado
-- "publicada" y un token corto, por lo que el enlace QR no podía cargar.
update public.cartas_digitales
set estado = 'activa',
    public_token = replace(id::text, '-', ''),
    updated_at = now()
where exists (
  select 1
  from public.usuarios_restaurantes ur
  where ur.restaurante_id = cartas_digitales.restaurante_id
    and ur.demo_vista is true
)
and (
  estado is distinct from 'activa'
  or length(trim(public_token)) is distinct from 32
);
