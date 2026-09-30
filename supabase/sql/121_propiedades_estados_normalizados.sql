-- Unifica estados de KW sin alterar el JSON de origen ni eliminar propiedades.
-- Se aplica antes del histórico, de modo que también conserva estas correcciones.
create or replace function private.normalizar_estado_propiedad_kw()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare clave text;
begin
  if new.fuente = 'kwmexico' then
    clave := regexp_replace(lower(translate(new.estado,
      'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')), '[^a-z0-9]', '', 'g');
    new.estado := case
      when clave in ('bcs', 'bajacaliforniasur') then 'Baja California Sur'
      when clave = 'chihuahua' then 'Chihuahua'
      when clave in ('qr', 'quintanaroo') then 'Quintana Roo'
      when clave in ('sin', 'sinaloa') then 'Sinaloa'
      when clave = 'morelos' then 'Morelos'
      when clave = 'nuevoleon' then 'Nuevo León'
      when clave in ('mexico', 'estadodemexico') then 'Estado de México'
      when clave in ('coahuila', 'coahuiladezaragoza') then 'Coahuila de Zaragoza'
      when clave in ('michoacan', 'michoacandeocampo') then 'Michoacán de Ocampo'
      else new.estado
    end;
  end if;
  return new;
end;
$$;

revoke all on function private.normalizar_estado_propiedad_kw() from public, anon, authenticated;
grant execute on function private.normalizar_estado_propiedad_kw() to service_role;

create trigger propiedades_normalizar_estado_kw
before insert or update of estado, fuente on public.propiedades
for each row execute function private.normalizar_estado_propiedad_kw();

-- El trigger transforma estas variantes; las filas y sus IDs se conservan.
update public.propiedades set estado = estado
where fuente = 'kwmexico' and estado in (
  'B.C.S.', 'chihuahua', 'Q.R.', 'Sin.', 'MORELOS', 'Nuevo Leon',
  'México', 'Estado De México', 'Coahuila', 'Michoacán'
);
