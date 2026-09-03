alter table public.restaurante_modulos
  add column if not exists rentabilidad boolean not null default false;

comment on column public.restaurante_modulos.rentabilidad is
  'Controls access to restaurant profitability screens independently from general metrics.';
