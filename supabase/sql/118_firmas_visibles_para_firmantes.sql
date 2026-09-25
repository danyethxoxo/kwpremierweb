-- 118 - Visibilidad de documentos para quienes tienen que firmarlos.
-- El correo se toma del JWT de Supabase para que cada usuario vea solo
-- los contratos donde aparece como firmante.

begin;

drop policy if exists "firmas_select" on public.firmas_documentos;
create policy "firmas_select" on public.firmas_documentos
  for select to authenticated using (
    (select auth.uid()) = user_id
    or (select public.is_staff_or_above())
    or exists (
      select 1 from public.documentos_guardados d
      where d.id = documento_guardado_id and d.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.documentos_plantilla p
      where p.id = documento_plantilla_id and p.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from jsonb_array_elements(
        coalesce(public.firmas_documentos.firmantes, '[]'::jsonb)
      ) as f(item)
      where lower(trim(f.item ->> 'correo')) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );

-- The original PDF is stored in the owner's folder. A matching signer can
-- read it, but does not receive upload, update, or delete permissions.
drop policy if exists "firmas_storage_select_own" on storage.objects;
create policy "firmas_storage_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'firmas'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_staff_or_above())
      or exists (
        select 1
        from public.firmas_documentos d
        where d.archivo_ruta = storage.objects.name
          and exists (
            select 1
            from jsonb_array_elements(
              coalesce(d.firmantes, '[]'::jsonb)
            ) as f(item)
            where lower(trim(f.item ->> 'correo')) = lower(trim((select auth.jwt() ->> 'email')))
          )
      )
    )
  );

commit;
