-- Allow agency administrators to inspect and maintain complete recipes.
drop policy if exists app_admin_full_access on public.plato_ingredientes;
create policy app_admin_full_access
on public.plato_ingredientes
as permissive
for all
to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

-- Keep the database calculation aligned with the UI:
-- purchase cost divided by usable quantity after waste.
create or replace view public.vw_rentabilidad_platos
with (security_invoker = true)
as
select
  p.id,
  p.restaurante_id,
  p.nombre,
  p.categoria,
  p.precio_venta,
  coalesce(
    sum(
      i.coste_compra
      / nullif(
          i.cantidad_compra * (1 - coalesce(i.merma_pct, 0) / 100.0),
          0
        )
      * pi.cantidad_usada
    ),
    0
  )::numeric(10, 2) as coste_total,
  (
    p.precio_venta
    - coalesce(
        sum(
          i.coste_compra
          / nullif(
              i.cantidad_compra * (1 - coalesce(i.merma_pct, 0) / 100.0),
              0
            )
          * pi.cantidad_usada
        ),
        0
      )
  )::numeric(10, 2) as beneficio_eur,
  case
    when p.precio_venta > 0 then (
      (
        p.precio_venta
        - coalesce(
            sum(
              i.coste_compra
              / nullif(
                  i.cantidad_compra * (1 - coalesce(i.merma_pct, 0) / 100.0),
                  0
                )
              * pi.cantidad_usada
            ),
            0
          )
      )
      / p.precio_venta
      * 100
    )
    else 0
  end::numeric(10, 2) as margen_pct
from public.platos p
left join public.plato_ingredientes pi on pi.plato_id = p.id
left join public.ingredientes i on i.id = pi.ingrediente_id
group by p.id, p.restaurante_id, p.nombre, p.categoria, p.precio_venta;
