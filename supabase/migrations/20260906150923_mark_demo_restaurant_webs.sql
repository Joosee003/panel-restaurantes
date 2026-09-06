alter table public.restaurante_webs
add column if not exists es_demo boolean not null default false;

update public.restaurante_webs
set es_demo = true
where slug in ('el-pescador-casa-barriguita', 'la-reserva-demo');

comment on column public.restaurante_webs.es_demo
is 'Prevents demonstration restaurant websites from being indexed as real businesses.';
