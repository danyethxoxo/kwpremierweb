-- Fase 93: permisos de API para las tablas nuevas del ABC.
-- La politica de privilegios del proyecto revoca los permisos por defecto.

grant select on public.abc_avance_historial to authenticated;
grant select, insert on public.abc_comentarios to authenticated;
grant usage, select on sequence public.abc_avance_historial_id_seq to authenticated;
grant usage, select on sequence public.abc_comentarios_id_seq to authenticated;

drop policy if exists "abc_avance_historial_select" on public.abc_avance_historial;
create policy "abc_avance_historial_select" on public.abc_avance_historial
  for select to authenticated using (private.is_staff_or_above());

drop policy if exists "abc_comentarios_select" on public.abc_comentarios;
create policy "abc_comentarios_select" on public.abc_comentarios
  for select to authenticated using (private.is_staff_or_above());

drop policy if exists "abc_comentarios_insert" on public.abc_comentarios;
create policy "abc_comentarios_insert" on public.abc_comentarios
  for insert to authenticated with check (private.is_staff_or_above());

drop policy if exists "mfa_sesion_requerida" on public.abc_avance_historial;
create policy "mfa_sesion_requerida" on public.abc_avance_historial
  as restrictive for all to authenticated
  using ((select public.mfa_sesion_autorizada()))
  with check ((select public.mfa_sesion_autorizada()));

drop policy if exists "mfa_sesion_requerida" on public.abc_comentarios;
create policy "mfa_sesion_requerida" on public.abc_comentarios
  as restrictive for all to authenticated
  using ((select public.mfa_sesion_autorizada()))
  with check ((select public.mfa_sesion_autorizada()));

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
