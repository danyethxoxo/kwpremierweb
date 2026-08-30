-- ═════════════════════════════════════════════════════════════
-- 073 · La base de asesores del Market Center
-- ═════════════════════════════════════════════════════════════
--
-- Como todos los de esta carpeta, se puede volver a correr sin romper
-- nada ni pisar lo que ya se haya capturado.
--
-- ─────────────────────────────────────────────────────────────
-- QUÉ ES ESTO
-- ─────────────────────────────────────────────────────────────
-- Hasta hoy, quién es asesor del MC vive en un libro de Google Sheets:
-- una hoja por grupo (activos, bajas, back office, células) y un renglón
-- por persona. El panel lo lee cada vez que se abre y lo enseña, pero no
-- guarda nada: si el libro se cierra, se renombra una hoja o alguien le
-- mueve una columna, el sitio se queda sin saber quién es quién.
--
-- Esta tabla es esa lista, ya del lado de la casa. Nace copiando lo que
-- el libro tiene y se queda: de aquí en adelante los asesores nuevos se
-- capturan aquí, y repartirlos (activo, baja, back office, célula) es
-- cambiarles el grupo en su renglón.
--
-- ─────────────────────────────────────────────────────────────
-- MIENTRAS EL LIBRO SIGA VIVO
-- ─────────────────────────────────────────────────────────────
-- No se apaga de golpe: hay gente que lleva años nutriéndolo y no se les
-- va a pedir que cambien de un día para otro. Así que cada vez que el
-- panel lee el libro, la Edge Function escribe también aquí lo que
-- encontró (crea a quien falte y actualiza a quien ya esté).
--
-- Con una regla, que es la que evita la pelea entre los dos lados:
--
--   Lo que se toca a mano aquí, aquí manda.
--
-- Cuando alguien cambia de grupo desde el sitio, su renglón se marca
-- (fijado = true) y la copia del libro deja de moverle el grupo. Los
-- demás datos (teléfono, KWID, puesto) sí se siguen refrescando desde el
-- libro: esos no son decisiones, son datos que allá se corrigen.
--
-- Un renglón capturado en el sitio nace con origen 'sitio' y sin hoja;
-- el libro nunca lo va a tocar porque no está en él.
--
-- ─────────────────────────────────────────────────────────────
-- POR QUÉ EL CORREO ES LA LLAVE
-- ─────────────────────────────────────────────────────────────
-- Es lo único que ya identifica a una persona en todo el sitio: con él
-- se le dan los accesos de Google, con él se casa su alta, y con él se
-- le encuentra en profiles cuando entra. El KWID no sirve: llega vacío
-- en media hoja y se repite en las bajas.
--
-- ─────────────────────────────────────────────────────────────
-- POR QUÉ LAS FECHAS SON TEXTO
-- ─────────────────────────────────────────────────────────────
-- Porque en el libro son texto de verdad: "15/03/24", "marzo 2024",
-- "pendiente". Convertirlas a date obligaría a tirar lo que no se
-- entienda, y eso es justo lo que no se puede hacer con el único lugar
-- donde esa información existe. Se guardan tal cual llegaron; cuando la
-- captura viva aquí y sea un calendario, se cambian de tipo con calma.
--
-- Requiere 001_profiles.sql y 005_roles_jerarquia.sql.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

-- ─────────────────────────────────────────────────────────────
-- 1) La tabla
-- ─────────────────────────────────────────────────────────────
create table if not exists public.asesores (
  id uuid primary key default gen_random_uuid(),

  -- Quién es
  correo text not null,
  nombre text,
  telefono text,
  kwid text,

  -- Dónde está: 'activos', 'bajas', 'back_office', 'celulas'. Es texto y
  -- no un enum porque el libro puede traer una hoja nueva mañana y un
  -- enum obligaría a una migración para poder guardarla.
  grupo text not null default 'activos',

  -- Lo que el libro trae de cada quien
  fecha_ingreso text,
  cumpleanos text,
  puesto text,
  celula text,
  fecha_baja text,
  usuario_command text,
  correo_personal text,
  tipo_asociado text,
  aniversario text,
  coach_asignado text,
  emergencia_nombre text,
  emergencia_telefono text,
  emergencia_correo text,
  emergencia_parentesco text,

  -- De dónde salió este renglón: 'excel' si lo trajo el libro, 'sitio'
  -- si se capturó aquí.
  origen text not null default 'sitio',
  hoja text,
  fila_hoja int,

  -- Lo tocó una persona desde el sitio: el libro ya no le mueve el grupo.
  fijado boolean not null default false,

  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Las columnas se agregan aparte para que volver a correr el archivo
-- alcance a una tabla que ya existía sin ellas: "create table if not
-- exists" no agrega nada a una tabla que ya está.
alter table public.asesores
  add column if not exists telefono text,
  add column if not exists kwid text,
  add column if not exists grupo text,
  add column if not exists fecha_ingreso text,
  add column if not exists cumpleanos text,
  add column if not exists puesto text,
  add column if not exists celula text,
  add column if not exists fecha_baja text,
  add column if not exists usuario_command text,
  add column if not exists correo_personal text,
  add column if not exists tipo_asociado text,
  add column if not exists aniversario text,
  add column if not exists coach_asignado text,
  add column if not exists emergencia_nombre text,
  add column if not exists emergencia_telefono text,
  add column if not exists emergencia_correo text,
  add column if not exists emergencia_parentesco text,
  add column if not exists origen text,
  add column if not exists hoja text,
  add column if not exists fila_hoja int,
  add column if not exists fijado boolean,
  add column if not exists notas text;

alter table public.asesores alter column grupo set default 'activos';
alter table public.asesores alter column origen set default 'sitio';
alter table public.asesores alter column fijado set default false;
update public.asesores set grupo = 'activos' where grupo is null;
update public.asesores set origen = 'sitio' where origen is null;
update public.asesores set fijado = false where fijado is null;

-- Una persona, un renglón. Va sobre el correo en minúsculas porque el
-- libro lo escribe como se le ocurre a quien captura: "Ana@KW.com" y
-- "ana@kw.com" son la misma persona y no pueden ser dos renglones.
create unique index if not exists asesores_correo_unico
  on public.asesores (lower(correo));

-- Se busca por nombre y por correo, y se lista por grupo.
create index if not exists asesores_grupo_idx on public.asesores (grupo);
create index if not exists asesores_nombre_idx on public.asesores (lower(nombre));

drop trigger if exists set_asesores_updated_at on public.asesores;
create trigger set_asesores_updated_at
  before update on public.asesores
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2) Quién la ve y quién la escribe
-- ─────────────────────────────────────────────────────────────
-- La misma gente que ya ve el panel: liderazgo (staff, admin, master).
-- Un asesor no tiene por qué ver el directorio completo con teléfonos de
-- emergencia, y la Edge Function entra con la llave de servicio, que se
-- salta RLS.
alter table public.asesores enable row level security;

drop policy if exists "select_liderazgo" on public.asesores;
create policy "select_liderazgo" on public.asesores
  for select to authenticated using (public.is_staff_or_above());

drop policy if exists "escribe_liderazgo" on public.asesores;
create policy "escribe_liderazgo" on public.asesores
  for all to authenticated
  using (public.is_staff_or_above()) with check (public.is_staff_or_above());

-- ─────────────────────────────────────────────────────────────
-- 3) Lo que se toca a mano queda marcado
-- ─────────────────────────────────────────────────────────────
-- Corre antes de cada update. Si el grupo cambió y quien lo cambió NO es
-- la copia del libro, el renglón se fija y el libro deja de moverlo.
--
-- La copia del libro se anuncia con una bandera que solo vive dentro de
-- su propia transacción (el "true" de set_config): así no hay que
-- adivinar quién escribe mirando las columnas, que es como se rompen
-- estas cosas.
create or replace function public.asesores_marcar_manual()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.grupo is distinct from old.grupo
     and coalesce(current_setting('kw.sincronizando_asesores', true), '') <> 'true' then
    new.fijado := true;
  end if;
  return new;
end;
$$;

drop trigger if exists asesores_marcar_manual on public.asesores;
create trigger asesores_marcar_manual
  before update on public.asesores
  for each row execute function public.asesores_marcar_manual();

-- ─────────────────────────────────────────────────────────────
-- 4) La copia del libro
-- ─────────────────────────────────────────────────────────────
-- Un renglón del libro entra completo: si la persona no está, nace; si
-- ya está, se le refrescan los datos. El grupo solo se toca cuando el
-- renglón no está fijado, que es la regla de arriba.
--
-- Va como función y no como un upsert desde la Edge Function porque el
-- "no le muevas el grupo a los fijados" es una condición por renglón, y
-- eso desde el cliente son dos vueltas a la base por persona.
--
-- Recibe el arreglo completo de una sola vez (jsonb) para que doscientas
-- personas sean una llamada y no doscientas.
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
        fecha_ingreso, cumpleanos, puesto, celula, fecha_baja,
        usuario_command, correo_personal, tipo_asociado, aniversario, coach_asignado,
        emergencia_nombre, emergencia_telefono, emergencia_correo, emergencia_parentesco,
        origen, hoja, fila_hoja
      ) values (
        v_correo,
        nullif(v_persona->>'nombre', ''),
        nullif(v_persona->>'telefono', ''),
        nullif(v_persona->>'kwid', ''),
        coalesce(nullif(v_persona->>'grupo', ''), 'activos'),
        nullif(v_persona->>'fechaIngreso', ''),
        nullif(v_persona->>'cumpleanos', ''),
        nullif(v_persona->>'puesto', ''),
        nullif(v_persona->>'celula', ''),
        nullif(v_persona->>'fechaBaja', ''),
        nullif(v_persona->>'usuarioCommand', ''),
        nullif(v_persona->>'correoPersonal', ''),
        nullif(v_persona->>'tipoAsociado', ''),
        nullif(v_persona->>'aniversario', ''),
        nullif(v_persona->>'coachAsignado', ''),
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
          else coalesce(nullif(v_persona->>'grupo', ''), grupo)
        end,
        fecha_ingreso = coalesce(nullif(v_persona->>'fechaIngreso', ''), fecha_ingreso),
        cumpleanos = coalesce(nullif(v_persona->>'cumpleanos', ''), cumpleanos),
        puesto = coalesce(nullif(v_persona->>'puesto', ''), puesto),
        celula = coalesce(nullif(v_persona->>'celula', ''), celula),
        fecha_baja = coalesce(nullif(v_persona->>'fechaBaja', ''), fecha_baja),
        usuario_command = coalesce(nullif(v_persona->>'usuarioCommand', ''), usuario_command),
        correo_personal = coalesce(nullif(v_persona->>'correoPersonal', ''), correo_personal),
        tipo_asociado = coalesce(nullif(v_persona->>'tipoAsociado', ''), tipo_asociado),
        aniversario = coalesce(nullif(v_persona->>'aniversario', ''), aniversario),
        coach_asignado = coalesce(nullif(v_persona->>'coachAsignado', ''), coach_asignado),
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
