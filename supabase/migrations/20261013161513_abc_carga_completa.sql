-- Una respuesta contiene todo el ABC sin el límite de filas de PostgREST.
-- Se ejecuta con los permisos del usuario; conserva RLS y la sesión MFA.
create or replace function public.abc_carga_completa()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(private.is_staff_or_above(), false)
     or not coalesce(public.mfa_sesion_autorizada(), false) then
    raise exception 'No tienes permiso para consultar el ABC' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'temas', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'orden', t.orden,
        'sesion', t.sesion, 'nombre', t.nombre) order by t.orden, t.id)
      from public.abc_temas t where t.activo
    ), '[]'::jsonb),
    'asesores', coalesce((
      select jsonb_agg(jsonb_build_object('kwid', a.kwid, 'nombre', a.nombre,
        'dt_asignado', a.dt_asignado, 'activo', a.activo,
        'fecha_ingreso', a.fecha_ingreso) order by a.nombre, a.kwid)
      from public.abc_asesores a
    ), '[]'::jsonb),
    'avances', coalesce((
      select jsonb_agg(jsonb_build_object('kwid', v.kwid, 'tema_id', v.tema_id))
      from public.abc_avance v where v.completado
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.abc_carga_completa() from public, anon;
grant execute on function public.abc_carga_completa() to authenticated;
