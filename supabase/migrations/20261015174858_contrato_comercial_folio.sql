-- Habilita la serie mensual del contrato comercial sin reiniciar contadores.
insert into public.folio_contadores (tipo_documento, prefijo)
values ('contrato_comercial', 'CC')
on conflict (tipo_documento) do nothing;

-- Reutiliza la sincronizacion existente y sus permisos; agrega solo Comercial.
do $comercial$
declare
  definicion text;
  rama text := $rama$
  elsif p_doc.tipo_documento = 'contrato_comercial' then
    v_fecha := public.operatividad_fecha(d ->> 'fecha');
    v := jsonb_build_object(
      'asociado_nombre', public.operatividad_texto(d ->> 'asesor'),
      'tipo', 'VENTA', 'division', 'COMERCIAL', 'exclusividad', 'EXCLUSIVA',
      'precio', public.operatividad_numero(d ->> 'precio'),
      'porcentaje', public.operatividad_numero(d ->> 'comision'),
      'fecha_contrato', v_fecha, 'mes_recibo', public.operatividad_mes(v_fecha),
      'cliente_nombre', public.operatividad_texto(d ->> 'cliente'),
      'numero_propietario', public.operatividad_texto(d ->> 'telefono_cliente')
    ) || public.operatividad_partir_direccion(d ->> 'inmueble');

  else
    return null;
  end if;
$rama$;
begin
  definicion := replace(pg_get_functiondef('public.operatividad_desde_documento(public.documentos_guardados)'::regprocedure), E'\r\n', E'\n');
  if strpos(definicion, 'p_doc.tipo_documento = ''contrato_comercial''') > 0 then return; end if;
  if strpos(definicion, E'  else\n    return null;\n  end if;') = 0 then
    raise exception 'No se encontro la rama esperada de operatividad_desde_documento';
  end if;
  execute replace(definicion, E'  else\n    return null;\n  end if;', rama);
end;
$comercial$;
