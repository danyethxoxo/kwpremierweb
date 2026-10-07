-- Recuperar versiones finalizadas archivadas por el editor anterior.
-- No se modifica ningun documento actual ni su historial.
insert into public.documentos_guardados
  (user_id,tipo_documento,nombre_archivo,datos,folio,estado,revision,created_at,updated_at,finalizado_at)
select distinct on (d.user_id,d.tipo_documento,r.contenido->>'folio',r.revision)
  d.user_id,d.tipo_documento,coalesce(r.contenido->>'nombre_archivo',d.nombre_archivo),
  r.contenido->'datos',r.contenido->>'folio','finalizado',r.revision,
  coalesce((r.contenido->>'created_at')::timestamptz,r.created_at),
  coalesce((r.contenido->>'updated_at')::timestamptz,r.created_at),
  (r.contenido->>'finalizado_at')::timestamptz
from public.documento_revisiones r
join public.documentos_guardados d on d.id=r.documento_id
where r.contenido->>'estado'='finalizado'
  and nullif(r.contenido->>'folio','') is not null
  and jsonb_typeof(r.contenido->'datos')='object'
  and not exists (
    select 1 from public.documentos_guardados actual
    where actual.user_id=d.user_id and actual.tipo_documento=d.tipo_documento
      and actual.folio=r.contenido->>'folio' and actual.revision=r.revision
  )
order by d.user_id,d.tipo_documento,r.contenido->>'folio',r.revision,r.created_at;
