-- El acceso administrativo ya está incluido en user_can_access_restaurant().
-- Evitamos evaluar dos políticas permisivas equivalentes en cada lectura.
drop policy if exists app_admin_full_access
on public.reserva_mesa_historial;

-- Índices de soporte para las claves foráneas del historial.
create index if not exists reserva_mesa_historial_reserva_id_idx
  on public.reserva_mesa_historial (reserva_id);

create index if not exists reserva_mesa_historial_mesa_anterior_id_idx
  on public.reserva_mesa_historial (mesa_anterior_id);

create index if not exists reserva_mesa_historial_mesa_nueva_id_idx
  on public.reserva_mesa_historial (mesa_nueva_id);
