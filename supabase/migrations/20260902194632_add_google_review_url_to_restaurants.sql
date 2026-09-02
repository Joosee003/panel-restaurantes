alter table public.restaurantes
  add column if not exists google_review_url text;

comment on column public.restaurantes.google_review_url is
  'Enlace directo para solicitar una reseña de Google desde el módulo Reseñas.';

update public.restaurantes as restaurant
set google_review_url = nullif(trim(config.google_review_url), '')
from public.opinion_config as config
where config.restaurante_id = restaurant.id
  and nullif(trim(config.google_review_url), '') is not null
  and nullif(trim(restaurant.google_review_url), '') is null;

alter table public.restaurantes
  drop constraint if exists restaurantes_google_review_url_http;

alter table public.restaurantes
  add constraint restaurantes_google_review_url_http
  check (
    google_review_url is null
    or google_review_url = ''
    or google_review_url ~* '^https?://'
  );
