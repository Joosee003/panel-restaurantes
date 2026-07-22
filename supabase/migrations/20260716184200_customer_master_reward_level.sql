alter table public.cupones
  drop constraint if exists cupones_nivel_minimo_check;

alter table public.cupones
  add constraint cupones_nivel_minimo_check check (
    nivel_minimo in ('nuevo', 'frecuente', 'habitual', 'vip', 'maestro')
  );

alter table public.premios_puntos
  drop constraint if exists premios_puntos_nivel_minimo_check;

alter table public.premios_puntos
  add constraint premios_puntos_nivel_minimo_check check (
    nivel_minimo in ('nuevo', 'frecuente', 'habitual', 'vip', 'maestro')
  );
