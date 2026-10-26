-- Folio independiente del inmueble para los datos del condominio.
begin;

alter table public.dictamenes
  add column if not exists condominio_folio_real text;

-- Conservar la definicion y las opciones actuales de la vista.
do $$
declare
  definicion text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dictamenes_con_asesor'
      and column_name = 'condominio_folio_real'
  ) then
    select pg_get_viewdef('public.dictamenes_con_asesor'::regclass, true) into definicion;
    if position('d.condominio_notaria_numero' in definicion) = 0 then
      raise exception 'No se encontro la columna de referencia de la vista';
    end if;
    execute 'create or replace view public.dictamenes_con_asesor as ' ||
      replace(definicion, 'd.condominio_notaria_numero',
        'd.condominio_notaria_numero, d.condominio_folio_real');
  end if;
end;
$$;

commit;
notify pgrst, 'reload schema';

