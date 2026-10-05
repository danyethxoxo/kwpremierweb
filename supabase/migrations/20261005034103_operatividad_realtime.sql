-- Actualiza la tabla visible al cambiar los documentos de origen.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='operatividad') then
    alter publication supabase_realtime add table public.operatividad;
  end if;
end;
$$;
