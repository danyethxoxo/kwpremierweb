begin;
insert into public.propiedades_feed_config(id,token_hash)values('qa-inventario-privado',repeat('b',64));
do $test$
declare filas jsonb;r jsonb;bloqueado boolean;inicial bigint;
begin
  select count(*) into inicial from public.propiedades;
  select jsonb_agg(jsonb_build_object('fuente_id','QA-PRIVADO-'||i,'estatus','publicada','titulo','Casa de prueba','operacion','venta','tipo','Casa','precio',4000000,'moneda','MXN','estado','Ciudad de México','municipio','Benito Juárez')) into filas from generate_series(1,10)i;
  r:=public.propiedades_feed_guardar_pruebas('qa-inventario-privado','alta','h1','2026-11-12T10:00:00Z','completo',filas);
  assert (r->>'nuevas')::int=10 and (r->>'almacenado_en_pruebas')::boolean and not (r->>'publicado')::boolean;
  r:=public.propiedades_feed_guardar_pruebas('qa-inventario-privado','alta','h1','2026-11-12T10:00:00Z','completo',filas);
  assert (r->>'repetido')::boolean;
  filas:=jsonb_set(filas,'{0,precio}','4500000');
  r:=public.propiedades_feed_guardar_pruebas('qa-inventario-privado','precio','h2','2026-11-12T11:00:00Z','incremental',filas);
  assert (r->>'actualizadas')::int=1;
  r:=public.propiedades_feed_guardar_pruebas('qa-inventario-privado','baja','h3','2026-11-12T12:00:00Z','incremental','[{"fuente_id":"QA-PRIVADO-1","estatus":"vendida"}]');
  assert (r->>'desactivadas')::int=1;
  assert (select datos->>'titulo'='Casa de prueba' and (datos->>'precio')::int=4500000 from public.propiedades_feed_pruebas where feed_id='qa-inventario-privado' and fuente_id='QA-PRIVADO-1');
  r:=public.propiedades_feed_guardar_pruebas('qa-inventario-privado','reactivar','h4','2026-11-12T13:00:00Z','incremental',jsonb_build_array(filas->0));
  assert (r->>'reactivadas')::int=1;
  bloqueado:=false;
  begin perform public.propiedades_feed_guardar_pruebas('qa-inventario-privado','truncado','h5','2026-11-12T14:00:00Z','completo',jsonb_build_array(filas->0));exception when raise_exception then bloqueado:=true;end;
  assert bloqueado;
  bloqueado:=false;
  begin perform public.propiedades_feed_guardar_pruebas('qa-inventario-privado','viejo','h6','2026-11-12T12:30:00Z','incremental',filas);exception when raise_exception then bloqueado:=true;end;
  assert bloqueado;
  r:=public.propiedades_feed_guardar_pruebas('qa-inventario-privado','completo-9','h7','2026-11-12T15:00:00Z','completo',filas-9);
  assert (r->>'desactivadas')::int=1;
  r:=public.propiedades_feed_consultar('qa-inventario-privado','QA-PRIVADO-10','suspendida',1);
  assert (r->>'total')::int=1 and (r->'resumen'->>'activas')::int=9;
  assert (select count(*)=inicial from public.propiedades);
  assert not has_table_privilege('anon','public.propiedades_feed_pruebas','SELECT');
  assert not has_table_privilege('authenticated','public.propiedades_feed_pruebas','SELECT');
  assert not has_function_privilege('anon','public.propiedades_feed_consultar(text,text,text,integer)','EXECUTE');
end
$test$;
select 'Inventario privado, cambios, bajas, reactivación, reenvíos, orden, límites y aislamiento comprobados' as resultado;
rollback;

