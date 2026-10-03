create table if not exists public.propiedades_miniaturas (
  propiedad_id uuid primary key references public.propiedades(id) on delete cascade,
  imagen_origen text not null,
  miniatura_url text,
  reintentar_despues timestamptz,
  bytes integer check (bytes between 0 and 250000),
  created_at timestamptz not null default now()
);
alter table public.propiedades_miniaturas enable row level security;
revoke all on public.propiedades_miniaturas from anon, authenticated;
grant select on public.propiedades_miniaturas to authenticated;
grant all on public.propiedades_miniaturas to service_role;
drop policy if exists miniaturas_lectura_sesion on public.propiedades_miniaturas;
create policy miniaturas_lectura_sesion on public.propiedades_miniaturas
for select to authenticated using ((select auth.uid()) is not null);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('propiedades-miniaturas','propiedades-miniaturas',true,250000,array['image/webp'])
on conflict(id) do nothing;

-- La vista conserva su orden de columnas y sus reglas de inventario.
do $$
declare definicion text;
begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='propiedades_inventario' and column_name='miniatura_url') then
    definicion := pg_get_viewdef('public.propiedades_inventario'::regclass,true);
    definicion := replace(definicion, 'FROM propiedades p',
      ', (select m.miniatura_url from public.propiedades_miniaturas m
          where m.propiedad_id=p.id and m.imagen_origen=p.imagenes->>0) as miniatura_url
       FROM public.propiedades p');
    execute 'create or replace view public.propiedades_inventario with (security_invoker=true,security_barrier=true) as ' || definicion;
  end if;
end;
$$;

create or replace function public.propiedades_miniaturas_pendientes(p_limite integer default 40)
returns table(id uuid,imagen_origen text)
language sql stable security invoker set search_path=pg_catalog,public as $$
  select p.id,p.imagenes->>0 from public.propiedades p
  where p.fuente='kwmexico' and nullif(p.imagenes->>0,'') is not null
    and not exists (select 1 from public.propiedades_miniaturas m
      where m.propiedad_id=p.id and m.imagen_origen=p.imagenes->>0
        and (m.miniatura_url is not null or m.reintentar_despues > now()))
  order by (p.estatus='publicada') desc,p.updated_at desc,p.id
  limit least(greatest(p_limite,1),100);
$$;
revoke all on function public.propiedades_miniaturas_pendientes(integer) from public,anon,authenticated;
grant execute on function public.propiedades_miniaturas_pendientes(integer) to service_role;
notify pgrst,'reload schema';
