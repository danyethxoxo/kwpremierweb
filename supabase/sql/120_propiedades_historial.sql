create table if not exists public.propiedades_historial (
 id bigint generated always as identity primary key,
 propiedad_id uuid not null,
 fuente text not null,
 fuente_id text,
 estatus_anterior text,
 estatus_nuevo text not null,
 registrado_at timestamptz not null default now(),
 tipo text not null check (tipo in ('estado_inicial','alta','cambio')),
 snapshot jsonb not null
);
alter table public.propiedades_historial enable row level security;
revoke all on public.propiedades_historial from public, anon, authenticated;
grant all on public.propiedades_historial to service_role;
grant usage, select on sequence public.propiedades_historial_id_seq to service_role;
create index if not exists propiedades_historial_propiedad_fecha on public.propiedades_historial(propiedad_id, registrado_at desc);
create or replace function private.registrar_propiedad_historial()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if TG_OP = 'INSERT' then
  insert into public.propiedades_historial(propiedad_id,fuente,fuente_id,estatus_nuevo,tipo,snapshot)
  values(new.id,new.fuente,new.fuente_id,new.estatus,'alta',to_jsonb(new));
 elsif (to_jsonb(old) - 'updated_at' - 'sincronizado_at') is distinct from
       (to_jsonb(new) - 'updated_at' - 'sincronizado_at') then
  insert into public.propiedades_historial(propiedad_id,fuente,fuente_id,estatus_anterior,estatus_nuevo,tipo,snapshot)
  values(new.id,new.fuente,new.fuente_id,old.estatus,new.estatus,'cambio',to_jsonb(new));
 end if;
 return new;
end;
$$;
revoke all on function private.registrar_propiedad_historial() from public,anon,authenticated;
create trigger propiedades_registrar_historial after insert or update on public.propiedades
for each row execute function private.registrar_propiedad_historial();
insert into public.propiedades_historial(propiedad_id,fuente,fuente_id,estatus_nuevo,tipo,snapshot)
select p.id,p.fuente,p.fuente_id,p.estatus,'estado_inicial',to_jsonb(p)
from public.propiedades p
where not exists(select 1 from public.propiedades_historial h where h.propiedad_id=p.id);
