begin;
do $test$ declare uid uuid:=gen_random_uuid(); a jsonb;b jsonb;begin
 perform set_config('request.jwt.claim.sub',uid::text,true);
 a:=private.propiedades_mapa_calcular('{"estatus":"publicada","estado":["Ciudad de México"],"tipo":["Casa"]}');
 b:=public.propiedades_inventario_mapa('{"estatus":"publicada","estado":["Ciudad de México"],"tipo":["Casa"]}');
 if a is distinct from b then raise exception 'Mapa cacheado diferente';end if;
 if b is distinct from public.propiedades_inventario_mapa('{"estatus":"publicada","estado":["Ciudad de México"],"tipo":["Casa"]}') then raise exception 'Cache inestable';end if;
 perform public.propiedades_inventario_mapa(null);
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.propiedades_inventario_mapa('{}');raise exception 'Anonimo autorizado';
 exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','private.propiedades_mapa_calcular(jsonb)','execute') then raise exception 'Funcion privada expuesta';end if;
end $test$;rollback;
