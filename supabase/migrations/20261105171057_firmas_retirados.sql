-- Recuerda los documentos retirados para no recrearlos desde un listado atrasado.
create table if not exists public.firmas_documentos_retirados (
  weetrust_document_id text not null,
  ambiente text not null check (ambiente in ('sandbox', 'produccion')),
  eliminado_at timestamptz not null default now(),
  primary key (weetrust_document_id, ambiente)
);
alter table public.firmas_documentos_retirados enable row level security;
revoke all on public.firmas_documentos_retirados from public, anon, authenticated;
grant all on public.firmas_documentos_retirados to service_role;
drop policy if exists firmas_retiros_servidor on public.firmas_documentos_retirados;
create policy firmas_retiros_servidor on public.firmas_documentos_retirados
for all to service_role using (true) with check (true);

create or replace function public.firmas_recordar_retiro()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.weetrust_document_id is not null then
    insert into public.firmas_documentos_retirados(weetrust_document_id,ambiente)
    values(old.weetrust_document_id,old.ambiente) on conflict do nothing;
  end if;
  return old;
end;
$$;
revoke all on function public.firmas_recordar_retiro() from public,anon,authenticated;
drop trigger if exists firmas_recordar_retiro on public.firmas_documentos;
create trigger firmas_recordar_retiro after delete on public.firmas_documentos
for each row execute function public.firmas_recordar_retiro();

create or replace function public.firmas_evitar_reingreso()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.weetrust_document_id is not null and exists (
    select 1 from public.firmas_documentos_retirados r
    where r.weetrust_document_id=new.weetrust_document_id and r.ambiente=new.ambiente
  ) then return null; end if;
  return new;
end;
$$;
revoke all on function public.firmas_evitar_reingreso() from public,anon,authenticated;
drop trigger if exists firmas_evitar_reingreso on public.firmas_documentos;
create trigger firmas_evitar_reingreso before insert on public.firmas_documentos
for each row execute function public.firmas_evitar_reingreso();
