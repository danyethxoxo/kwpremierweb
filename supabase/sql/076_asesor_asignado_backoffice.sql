-- ═════════════════════════════════════════════════════════════
-- 076 · Asesor asignado a cada integrante de Back Office
-- ═════════════════════════════════════════════════════════════
-- La hoja 4. BACKOFFICE trae una columna “Asesor”. Se conserva en la
-- base para mostrar de quién es asistente cada integrante, incluso si
-- después se deja de usar el Google Sheet.

alter table public.asesores
  add column if not exists asesor_asignado text;

create or replace function public.asesores_sincronizar(p_personas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creados int := 0;
  v_actualizados int := 0;
  v_persona jsonb;
  v_correo text;
  v_existe public.asesores%rowtype;
begin
  if not public.is_staff_or_above() then
    raise exception 'Solo el liderazgo puede sincronizar asesores.';
  end if;

  -- La bandera que le dice al disparador de arriba que quien escribe es
  -- la copia del libro y no una persona.
  perform set_config('kw.sincronizando_asesores', 'true', true);

  for v_persona in select * from jsonb_array_elements(coalesce(p_personas, '[]'::jsonb))
  loop
    v_correo := lower(trim(coalesce(v_persona->>'correo', '')));
    -- Sin correo no hay a quién guardar: el libro trae renglones a medio
    -- llenar y subtítulos, y meterlos aquí sería llenar la base de
    -- fantasmas. El panel ya los reporta aparte como "omitidos".
    continue when v_correo = '';

    select * into v_existe from public.asesores where lower(correo) = v_correo;

    if v_existe.id is null then
      insert into public.asesores (
        correo, nombre, telefono, kwid, grupo,
        fecha_ingreso, cumpleanos, puesto, celula, fecha_baja, curp,
        usuario_command, contrasena, correo_personal, tipo_asociado, clasificacion,
        sponsor, aniversario, coach_asignado, asesor_asignado,
        emergencia_nombre, emergencia_telefono, emergencia_correo, emergencia_parentesco,
        origen, hoja, fila_hoja
      ) values (
        v_correo,
        nullif(v_persona->>'nombre', ''),
        nullif(v_persona->>'telefono', ''),
        nullif(v_persona->>'kwid', ''),
        public.asesores_estatus_de_hoja(v_persona->>'grupo'),
        nullif(v_persona->>'fechaIngreso', ''),
        nullif(v_persona->>'cumpleanos', ''),
        nullif(v_persona->>'puesto', ''),
        nullif(v_persona->>'celula', ''),
        nullif(v_persona->>'fechaBaja', ''),
        nullif(v_persona->>'curp', ''),
        nullif(v_persona->>'usuarioCommand', ''),
        nullif(v_persona->>'contrasena', ''),
        nullif(v_persona->>'correoPersonal', ''),
        nullif(v_persona->>'tipoAsociado', ''),
        nullif(v_persona->>'clasificacion', ''),
        nullif(v_persona->>'sponsor', ''),
        nullif(v_persona->>'aniversario', ''),
        nullif(v_persona->>'coachAsignado', ''),
        nullif(v_persona->>'asesorAsignado', ''),
        nullif(v_persona->>'emergenciaNombre', ''),
        nullif(v_persona->>'emergenciaTelefono', ''),
        nullif(v_persona->>'emergenciaCorreo', ''),
        nullif(v_persona->>'emergenciaParentesco', ''),
        'excel',
        nullif(v_persona->>'hoja', ''),
        nullif(v_persona->>'fila', '')::int
      );
      v_creados := v_creados + 1;
    else
      -- Lo que llega vacío del libro no borra lo que ya había: una
      -- columna que allá se dejó en blanco casi siempre es que nadie la
      -- llenó, no que el dato dejó de existir. Para vaciar un campo se
      -- vacía aquí, a mano.
      update public.asesores set
        nombre = coalesce(nullif(v_persona->>'nombre', ''), nombre),
        telefono = coalesce(nullif(v_persona->>'telefono', ''), telefono),
        kwid = coalesce(nullif(v_persona->>'kwid', ''), kwid),
        grupo = case
          when fijado then grupo
          else coalesce(public.asesores_estatus_de_hoja(v_persona->>'grupo'), grupo)
        end,
        fecha_ingreso = coalesce(nullif(v_persona->>'fechaIngreso', ''), fecha_ingreso),
        cumpleanos = coalesce(nullif(v_persona->>'cumpleanos', ''), cumpleanos),
        puesto = coalesce(nullif(v_persona->>'puesto', ''), puesto),
        celula = coalesce(nullif(v_persona->>'celula', ''), celula),
        fecha_baja = coalesce(nullif(v_persona->>'fechaBaja', ''), fecha_baja),
        curp = coalesce(nullif(v_persona->>'curp', ''), curp),
        usuario_command = coalesce(nullif(v_persona->>'usuarioCommand', ''), usuario_command),
        contrasena = coalesce(nullif(v_persona->>'contrasena', ''), contrasena),
        correo_personal = coalesce(nullif(v_persona->>'correoPersonal', ''), correo_personal),
        tipo_asociado = coalesce(nullif(v_persona->>'tipoAsociado', ''), tipo_asociado),
        clasificacion = coalesce(nullif(v_persona->>'clasificacion', ''), clasificacion),
        sponsor = coalesce(nullif(v_persona->>'sponsor', ''), sponsor),
        aniversario = coalesce(nullif(v_persona->>'aniversario', ''), aniversario),
        coach_asignado = coalesce(nullif(v_persona->>'coachAsignado', ''), coach_asignado),
        asesor_asignado = coalesce(nullif(v_persona->>'asesorAsignado', ''), asesor_asignado),
        emergencia_nombre = coalesce(nullif(v_persona->>'emergenciaNombre', ''), emergencia_nombre),
        emergencia_telefono = coalesce(nullif(v_persona->>'emergenciaTelefono', ''), emergencia_telefono),
        emergencia_correo = coalesce(nullif(v_persona->>'emergenciaCorreo', ''), emergencia_correo),
        emergencia_parentesco = coalesce(nullif(v_persona->>'emergenciaParentesco', ''), emergencia_parentesco),
        hoja = coalesce(nullif(v_persona->>'hoja', ''), hoja),
        fila_hoja = coalesce(nullif(v_persona->>'fila', '')::int, fila_hoja)
      where id = v_existe.id;
      v_actualizados := v_actualizados + 1;
    end if;
  end loop;

  return jsonb_build_object('creados', v_creados, 'actualizados', v_actualizados);
end;
$$;

revoke all on function public.asesores_sincronizar(jsonb) from public;
grant execute on function public.asesores_sincronizar(jsonb) to authenticated;
