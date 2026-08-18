-- El liderazgo ve el historial completo de firmas.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.
--
-- La pantalla de Firmas abre con el historial de documentos. Cada asesor
-- ve los suyos; Master, Admin y Staff ven los de todo el equipo, igual
-- que ya pasa con los documentos guardados desde la Fase 5.
--
-- Antes esto usaba is_admin(), que deja fuera a Staff. Eso hacía que a
-- alguien de liderazgo el historial le saliera casi vacío sin explicar
-- por qué: no es que no hubiera envíos, es que no los podía ver.

-- ── De quién es cada envío ──
-- El historial del liderazgo enseña el nombre de quien mandó cada
-- documento. Para que eso se pueda pedir en la misma consulta, la
-- columna tiene que apuntar a profiles y no a auth.users: sin una llave
-- foránea entre las dos tablas, PostgREST no sabe cómo unirlas y hay que
-- salir a buscar los nombres en una segunda vuelta.
--
-- Es seguro: profiles.id ya es la misma llave que auth.users.id, así que
-- apuntar a profiles no cambia a qué fila se refiere, solo por dónde se
-- llega. Es además lo que ya hacen documentos_plantilla y las demás
-- tablas del proyecto.
alter table public.firmas_documentos
  drop constraint if exists firmas_documentos_user_id_fkey;
alter table public.firmas_documentos
  add constraint firmas_documentos_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

drop policy if exists "firmas_select" on public.firmas_documentos;
create policy "firmas_select" on public.firmas_documentos
  for select using (
    auth.uid() = user_id
    or public.is_staff_or_above()
    or exists (
      select 1 from public.documentos_guardados d
      where d.id = documento_guardado_id and d.user_id = auth.uid()
    )
    or exists (
      select 1 from public.documentos_plantilla p
      where p.id = documento_plantilla_id and p.user_id = auth.uid()
    )
  );

-- El historial enseña de quién es cada envío cuando lo mira el
-- liderazgo. Para eso la pantalla necesita leer el nombre del autor, y
-- las políticas de profiles ya permiten ver a los compañeros, así que no
-- hace falta tocar nada más ahí.

-- Los archivos del bucket, igual: quien es Staff o más puede abrir el
-- PDF de cualquier envío, no solo el suyo. Sin esto el renglón se ve en
-- la lista pero el documento no se puede abrir, que es peor que no
-- verlo.
drop policy if exists "firmas_storage_select_own" on storage.objects;
create policy "firmas_storage_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'firmas'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff_or_above())
  );
