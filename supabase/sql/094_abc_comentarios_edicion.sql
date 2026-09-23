-- Fase 94: edición y eliminación de comentarios del ABC.

grant update (comentario), delete on public.abc_comentarios to authenticated;

drop policy if exists "abc_comentarios_update" on public.abc_comentarios;
create policy "abc_comentarios_update" on public.abc_comentarios
  for update to authenticated
  using (private.is_staff_or_above())
  with check (private.is_staff_or_above());

drop policy if exists "abc_comentarios_delete" on public.abc_comentarios;
create policy "abc_comentarios_delete" on public.abc_comentarios
  for delete to authenticated
  using (private.is_staff_or_above());

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
