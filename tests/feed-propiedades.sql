-- Ejecutar como administrador. Todo se revierte, incluidas las fichas y su historial.
begin;
insert into public.propiedades_feed_config(id,token_hash,publicacion_habilitada)
  values ('qa-feed-transaccion',repeat('a',64),true);
do $test$
declare filas jsonb; r jsonb; bloqueado boolean;
begin
  select jsonb_agg(jsonb_build_object('fuente_id','QA-FEED-'||i,'estatus','publicada','titulo','Prueba de integración',
    'operacion','venta','tipo','Casa','precio',4500000,'moneda','MXN','estado','Ciudad de México','municipio','Benito Juárez','imagenes','[]'::jsonb))
    into filas from generate_series(1,10) i;
  r:=public.propiedades_feed_recibir('qa-feed-transaccion','validar','hash1','2026-11-11T10:00:00Z','completo',filas,false);
  assert r->>'estado'='validado';
  assert (select count(*)=0 from public.propiedades where fuente='feed:qa-feed-transaccion');
  r:=public.propiedades_feed_recibir('qa-feed-transaccion','alta','hash2','2026-11-11T10:00:00Z','completo',filas,true);
  assert (r->>'nuevas')::int=10;
  r:=public.propiedades_feed_recibir('qa-feed-transaccion','alta','hash2','2026-11-11T10:00:00Z','completo',filas,true);
  assert (r->>'repetido')::boolean;
  bloqueado:=false;
  begin perform public.propiedades_feed_recibir('qa-feed-transaccion','alta','otro-hash','2026-11-11T10:00:00Z','completo',filas,true);
  exception when raise_exception then bloqueado:=true; end;
  assert bloqueado;
  filas:=jsonb_set(filas,'{0,precio}','4600000');
  r:=public.propiedades_feed_recibir('qa-feed-transaccion','precio','hash3','2026-11-11T11:00:00Z','incremental',filas,true);
  assert (r->>'actualizadas')::int=1;
  r:=public.propiedades_feed_recibir('qa-feed-transaccion','baja','hash4','2026-11-11T12:00:00Z','incremental','[{"fuente_id":"QA-FEED-1","estatus":"vendida"}]',true);
  assert (r->>'desactivadas')::int=1;
  assert (select titulo='Prueba de integración' and estatus='vendida' from public.propiedades where fuente='feed:qa-feed-transaccion' and fuente_id='QA-FEED-1');
  r:=public.propiedades_feed_recibir('qa-feed-transaccion','reactivar','hash5','2026-11-11T13:00:00Z','incremental',jsonb_build_array(filas->0),true);
  assert (r->>'reactivadas')::int=1;
  bloqueado:=false;
  begin perform public.propiedades_feed_recibir('qa-feed-transaccion','viejo','hash6','2026-11-11T12:30:00Z','incremental',filas,true);
  exception when raise_exception then bloqueado:=true; end;
  assert bloqueado;
  bloqueado:=false;
  begin perform public.propiedades_feed_recibir('qa-feed-transaccion','incompleto','hash7','2026-11-11T14:00:00Z','completo',jsonb_build_array(filas->0),true);
  exception when raise_exception then bloqueado:=true; end;
  assert bloqueado;
  assert (select count(*)=10 from public.propiedades where fuente='feed:qa-feed-transaccion' and estatus='publicada');
  r:=public.propiedades_feed_recibir('qa-feed-transaccion','completo-9','hash8','2026-11-11T15:00:00Z','completo',filas-9,true);
end
$test$;
select 'Altas, cambios, bajas, reactivación, reenvíos y protección transaccional comprobados' as resultado;
rollback;

