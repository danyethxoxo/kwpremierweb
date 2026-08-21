-- Fase 34: dictámenes de expedientes.
--
-- Hoy el dictamen se escribe a mano, se escanea con el teléfono, se manda
-- a recepción y de ahí sale un correo al asesor con copia a medio
-- liderazgo. El PDF llega, sí, pero ahí muere: nadie sabe si el asesor
-- corrigió lo que se le pidió, ni cuánto lleva atorado, ni qué
-- expedientes traen pendientes hoy.
--
-- Por eso el corazón de esto NO es el documento, son las observaciones.
-- Cada una es su propio renglón con su propio estado, y de ahí sale todo
-- lo demás: el PDF, el semáforo del expediente y la respuesta a "¿qué
-- trae atorada la oficina?".
--
-- ─────────────────────────────────────────────────────────────
-- POR QUÉ LAS OBSERVACIONES VAN EN SU PROPIA TABLA
-- ─────────────────────────────────────────────────────────────
-- Cabrían como una lista dentro del dictamen, y sería menos código. Pero
-- entonces marcar una significaría reescribir la lista entera, y dos
-- personas trabajando el mismo expediente al mismo tiempo se pisarían.
-- Además no habría manera de preguntar "cuántas llevan más de un mes sin
-- corregir" sin recorrer todos los dictámenes a mano.
--
-- ─────────────────────────────────────────────────────────────
-- QUIÉN ES EL ASESOR
-- ─────────────────────────────────────────────────────────────
-- No es un usuario del sitio: es un renglón de un catálogo propio. Por
-- ahora los dictámenes se llevan de forma interna y los asesores no
-- entran a la plataforma, así que amarrarlos a una cuenta dejaría fuera a
-- los 90 y tantos que no tienen. El catálogo se carga del Excel del
-- Market Center y se busca por nombre.
--
-- Si algún día se les abre el acceso, el catálogo puede ganar una columna
-- que apunte al perfil, y ahí sí cada quien vería lo suyo. Hoy no hace
-- falta y no se construye.
--
-- ─────────────────────────────────────────────────────────────
-- QUIÉN DICTAMINA
-- ─────────────────────────────────────────────────────────────
-- No es un rol nuevo: es un permiso suelto sobre el perfil, que Master y
-- Admin encienden desde el Panel. Master lo trae siempre. Hoy lo usa una
-- sola persona (la abogada), pero si se va de vacaciones o entra alguien
-- más al equipo legal, no hay que tocar la base de datos.
--
-- Requiere 001_profiles.sql, 005_roles_jerarquia.sql y
-- 013_notificaciones.sql.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

-- ─────────────────────────────────────────────────────────────
-- 1) El permiso de dictaminar
-- ─────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists puede_dictaminar boolean not null default false;

comment on column public.profiles.puede_dictaminar is
  'Puede levantar dictámenes y moverles el estado. Lo encienden Master y Admin desde el Panel. Master lo trae siempre.';

-- Master lo trae encendido. La función de abajo lo dejaría pasar de todos
-- modos, pero entonces el Panel enseñaría la casilla apagada para alguien
-- que sí puede: el dato tiene que decir lo mismo que el sistema hace.
update public.profiles set puede_dictaminar = true
where role = 'master' and puede_dictaminar = false;

create or replace function public.puede_dictaminar()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (puede_dictaminar = true or role = 'master')
  );
$$;

grant execute on function public.puede_dictaminar() to authenticated;

-- Y quien llegue a Master después también, sin que nadie se acuerde de
-- prenderle la casilla.
create or replace function public.master_siempre_dictamina()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.role = 'master' then new.puede_dictaminar := true; end if;
  return new;
end;
$$;

drop trigger if exists trg_master_siempre_dictamina on public.profiles;
create trigger trg_master_siempre_dictamina
  before insert or update of role, puede_dictaminar on public.profiles
  for each row execute function public.master_siempre_dictamina();

-- ─────────────────────────────────────────────────────────────
-- 2) El catálogo de asesores
-- ─────────────────────────────────────────────────────────────
-- Antes esto era una vista sobre los perfiles del sitio. Se cambia por
-- una tabla propia: los asesores del Market Center no tienen cuenta, y
-- son ellos los que aparecen en un dictamen.
--
-- El drop va condicionado a que todavía sea vista: "drop view if exists"
-- solo perdona que el objeto no exista, no que exista pero sea de otro
-- tipo. La primera vez que corrió este archivo convirtió la vista en
-- tabla; sin la condición, cualquier corrida posterior tronaría aquí
-- porque para entonces el objeto ya es una tabla.
do $$
begin
  if exists (
    select 1 from pg_class where relname = 'dictamen_asesores' and relkind = 'v'
  ) then
    execute 'drop view public.dictamen_asesores';
  end if;
end $$;

create table if not exists public.dictamen_asesores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  correo text,
  -- Quien se va del Market Center se apaga, no se borra: sus dictámenes
  -- viejos tienen que seguir diciendo de quién eran.
  activo boolean not null default true,
  created_at timestamptz not null default now(),

  constraint dictamen_asesores_nombre_largo check (char_length(trim(nombre)) between 3 and 160)
);

-- El correo identifica a la persona mejor que el nombre (hay homónimos, y
-- los nombres se escriben de tres maneras).
--
-- Va sobre la columna tal cual, no sobre lower(correo): un índice por
-- expresión no sirve como blanco de "on conflict" en un upsert, y el
-- sincronizador con la hoja del ABC necesita justo eso. Por eso el
-- correo se guarda siempre en minúsculas desde donde se escribe (el
-- sincronizador y el resto del código), así que la columna tal cual ya
-- hace las veces de único sin distinguir mayúsculas.
--
-- Tampoco lleva "where correo is not null": no hace falta, porque en un
-- índice único de Postgres varios NULL nunca chocan entre sí (NULL no es
-- igual a NULL). Con el "where" quedaba como índice parcial, y un índice
-- parcial no sirve de blanco de "on conflict" a menos que el upsert
-- repita ahí mismo el mismo "where", cosa que el cliente de Supabase no
-- hace: por eso tronaba con "no unique or exclusion constraint matching
-- the ON CONFLICT specification".
drop index if exists public.idx_dictamen_asesores_correo;
create unique index if not exists idx_dictamen_asesores_correo
  on public.dictamen_asesores(correo);
create index if not exists idx_dictamen_asesores_nombre
  on public.dictamen_asesores(activo, nombre);

alter table public.dictamen_asesores enable row level security;

drop policy if exists "select_liderazgo" on public.dictamen_asesores;
create policy "select_liderazgo" on public.dictamen_asesores
  for select to authenticated
  using (public.is_staff_or_above() or public.puede_dictaminar());

drop policy if exists "escribe_dictaminador" on public.dictamen_asesores;
create policy "escribe_dictaminador" on public.dictamen_asesores
  for all to authenticated
  using (public.puede_dictaminar()) with check (public.puede_dictaminar());

-- ─────────────────────────────────────────────────────────────
-- 3) El catálogo de tipos de inmueble
-- ─────────────────────────────────────────────────────────────
-- Arranca con los de siempre y crece solo: si al llenar un dictamen hace
-- falta uno que no está, se escribe y queda guardado para la próxima. Es
-- el mismo trato que las etiquetas de Firmas.
create table if not exists public.dictamen_tipos_inmueble (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now(),

  constraint dictamen_tipos_nombre_largo check (char_length(trim(nombre)) between 2 and 60)
);

insert into public.dictamen_tipos_inmueble (nombre)
values ('Casa'), ('Departamento'), ('Terreno'), ('Oficina'),
       ('Local comercial'), ('Bodega'), ('Edificio')
on conflict (nombre) do nothing;

alter table public.dictamen_tipos_inmueble enable row level security;

drop policy if exists "select_liderazgo" on public.dictamen_tipos_inmueble;
create policy "select_liderazgo" on public.dictamen_tipos_inmueble
  for select to authenticated
  using (public.is_staff_or_above() or public.puede_dictaminar());

drop policy if exists "escribe_dictaminador" on public.dictamen_tipos_inmueble;
create policy "escribe_dictaminador" on public.dictamen_tipos_inmueble
  for all to authenticated
  using (public.puede_dictaminar()) with check (public.puede_dictaminar());

-- ─────────────────────────────────────────────────────────────
-- 4) El dictamen
-- ─────────────────────────────────────────────────────────────

create table if not exists public.dictamenes (
  id uuid primary key default gen_random_uuid(),

  -- El folio se pone al dictaminar, no al crear el borrador: uno que se
  -- descarta no debe gastarse un número de la serie.
  folio text unique,

  asesor_id uuid not null references public.dictamen_asesores(id) on delete restrict,

  -- Quién lo levantó. Se conserva aunque esa persona salga de la oficina:
  -- el dictamen sigue siendo constancia de lo que se revisó.
  dictaminado_por uuid references public.profiles(id) on delete set null,

  -- La fecha del dictamen la pone quien dictamina, no el reloj. Nace con
  -- la de hoy, pero se puede corregir: a veces se captura días después de
  -- haber revisado el expediente, y la que vale es la de la revisión.
  fecha_dictamen date not null default current_date,

  cliente text,
  inmueble text not null,

  -- El tipo de oportunidad son dos cosas distintas y por eso van en dos
  -- columnas: qué se hace con el inmueble, y para qué sirve.
  operacion text not null default 'venta'
    check (operacion in ('venta', 'renta')),
  uso text not null default 'residencial'
    check (uso in ('residencial', 'comercial', 'mixto')),

  tipo_inmueble_id uuid references public.dictamen_tipos_inmueble(id) on delete set null,

  -- ── Los datos del expediente ──
  -- Los renglones del machote. Todos texto libre y todos opcionales, a
  -- propósito: "Escritura 25,928 de fecha 01 de agosto del 2000" no es
  -- una fecha, y un expediente a medio revisar tiene huecos por
  -- definición. Obligar a llenarlos volvería el formato una carrera de
  -- obstáculos justo cuando lo que falta ES el hallazgo.
  escritura_propiedad text,
  escritura_condominio text,
  cfdi text,
  superficie_escritura text,
  cuenta_predial text,
  superficie_predial text,
  estado_civil text,
  folio_real text,
  observaciones text,

  -- ── El dictamen en sí ──
  -- borrador     se está armando, todavía no tiene folio
  -- devuelta     el expediente se regresa: le falta lo grueso
  -- condicionada se autoriza sujeto a que se corrija lo que se anotó
  -- autorizada   listo para promoción
  --
  -- Lo mueve quien dictamina, a mano. No se calcula de las observaciones
  -- a propósito: que no quede ninguna pendiente no quiere decir que el
  -- expediente esté autorizado, esa es una decisión y la toma una persona.
  estado text not null default 'borrador'
    check (estado in ('borrador', 'devuelta', 'condicionada', 'autorizada')),

  -- Archivar es sacarlo de la vista sin perderlo. Borrar de verdad solo
  -- se puede desde el archivo, y es a propósito: obliga a pasar por dos
  -- decisiones separadas en vez de una sola en caliente.
  archivado_at timestamptz,

  dictaminado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint dictamenes_inmueble_largo check (char_length(trim(inmueble)) between 3 and 400)
);

-- Para las bases donde la tabla ya se creó con una versión anterior de
-- este archivo: "create table if not exists" no agrega columnas a una
-- tabla que ya está.
alter table public.dictamenes
  add column if not exists fecha_dictamen date not null default current_date,
  add column if not exists cliente text,
  add column if not exists uso text not null default 'residencial',
  add column if not exists tipo_inmueble_id uuid references public.dictamen_tipos_inmueble(id) on delete set null,
  add column if not exists escritura_propiedad text,
  add column if not exists escritura_condominio text,
  add column if not exists cfdi text,
  add column if not exists superficie_escritura text,
  add column if not exists cuenta_predial text,
  add column if not exists superficie_predial text,
  add column if not exists estado_civil text,
  add column if not exists folio_real text,
  add column if not exists archivado_at timestamptz,
  add column if not exists dictaminado_at timestamptz;

-- ── Poner al día las llaves y los "check" de una base vieja ──
--
-- Los alter de arriba agregan columnas, pero una llave foránea o un check
-- no son columnas: se quedan como nacieron. En una base donde esta tabla
-- se creó con la primera versión de este archivo siguen vivos los de
-- entonces, y cada uno rechaza justo lo que la pantalla manda hoy:
--
--   asesor_id  apuntaba a profiles, porque el asesor era un usuario del
--              sitio. Hoy es un renglón del catálogo, así que cualquier
--              dictamen nuevo truena con "violates foreign key
--              constraint dictamenes_asesor_id_fkey".
--   estado     traía los estados de antes (abierto, en_revision,
--              cerrado), así que dictaminar() no puede dejarlo en
--              devuelta, condicionada ni autorizada.
--   inmueble   estaba topado a 200 caracteres, y una dirección con
--              colonia y alcaldía se pasa.
--
-- Todos van "not valid": revisar los renglones viejos aquí haría fallar
-- el archivo entero en una base que todavía tenga dictámenes de aquella
-- versión, y esos renglones no son de nadie que haya capturado desde el
-- sitio como está hoy. La llave queda activa para todo lo que entre de
-- ahora en adelante, que es lo que importa.
alter table public.dictamenes drop constraint if exists dictamenes_asesor_id_fkey;
alter table public.dictamenes
  add constraint dictamenes_asesor_id_fkey
  foreign key (asesor_id) references public.dictamen_asesores(id) on delete restrict
  not valid;

alter table public.dictamenes drop constraint if exists dictamenes_estado_check;
alter table public.dictamenes
  add constraint dictamenes_estado_check
  check (estado in ('borrador', 'devuelta', 'condicionada', 'autorizada'))
  not valid;

alter table public.dictamenes drop constraint if exists dictamenes_operacion_check;
alter table public.dictamenes
  add constraint dictamenes_operacion_check
  check (operacion in ('venta', 'renta'))
  not valid;

alter table public.dictamenes drop constraint if exists dictamenes_uso_check;
alter table public.dictamenes
  add constraint dictamenes_uso_check
  check (uso in ('residencial', 'comercial', 'mixto'))
  not valid;

alter table public.dictamenes drop constraint if exists dictamenes_inmueble_largo;
alter table public.dictamenes
  add constraint dictamenes_inmueble_largo
  check (char_length(trim(inmueble)) between 3 and 400)
  not valid;

-- Si no quedó ningún renglón viejo estorbando, se validan y dejan de ser
-- "not valid". Si sí quedaron, se avisa y se sigue: la base queda
-- funcionando para lo nuevo, que es lo que se venía a arreglar.
do $$
declare
  v_nombre text;
begin
  foreach v_nombre in array array[
    'dictamenes_asesor_id_fkey', 'dictamenes_estado_check',
    'dictamenes_operacion_check', 'dictamenes_uso_check',
    'dictamenes_inmueble_largo'
  ] loop
    begin
      execute format('alter table public.dictamenes validate constraint %I', v_nombre);
    exception when others then
      raise notice 'Quedaron dictámenes viejos que no cumplen %. Se deja activa para lo nuevo.', v_nombre;
    end;
  end loop;
end $$;

create index if not exists idx_dictamenes_asesor
  on public.dictamenes(asesor_id, created_at desc);
-- El archivo se consulta poco y la lista de siempre se consulta mucho, así
-- que el índice cubre nada más lo que está a la vista.
create index if not exists idx_dictamenes_estado
  on public.dictamenes(estado, created_at desc) where archivado_at is null;

alter table public.dictamenes enable row level security;

-- Todo el liderazgo ve los dictámenes: la idea es justamente que
-- cualquiera pueda entrar a ver en qué va un expediente.
drop policy if exists "select_liderazgo" on public.dictamenes;
create policy "select_liderazgo" on public.dictamenes
  for select to authenticated using (public.is_staff_or_above());

drop policy if exists "insert_dictaminador" on public.dictamenes;
create policy "insert_dictaminador" on public.dictamenes
  for insert to authenticated
  with check (public.puede_dictaminar() and dictaminado_por = auth.uid());

drop policy if exists "update_dictaminador" on public.dictamenes;
create policy "update_dictaminador" on public.dictamenes
  for update to authenticated using (public.puede_dictaminar());

-- Borrar solo lo archivado. Es lo que vuelve al archivo una red y no un
-- trámite: para perder un dictamen hay que archivarlo primero y luego
-- borrarlo, dos decisiones en dos momentos.
drop policy if exists "delete_archivados" on public.dictamenes;
create policy "delete_archivados" on public.dictamenes
  for delete to authenticated
  using (public.puede_dictaminar() and archivado_at is not null);

drop trigger if exists set_dictamenes_updated_at on public.dictamenes;
create trigger set_dictamenes_updated_at
  before update on public.dictamenes
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5) Las observaciones por atender
-- ─────────────────────────────────────────────────────────────

create table if not exists public.dictamen_puntos (
  id uuid primary key default gen_random_uuid(),
  dictamen_id uuid not null references public.dictamenes(id) on delete cascade,

  -- El orden lo pone quien dictamina: en el PDF se lee como lista
  -- numerada, y ahí sí importa cuál va primero.
  orden integer not null default 0,

  texto text not null,

  -- Dos estados y ya. Se probó con más (corregido a medias, no aplica) y
  -- sobraban: lo único que se necesita saber de una observación es si
  -- sigue pendiente o si ya quedó.
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'corregida')),

  nota text,
  corregida_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint dictamen_puntos_texto_largo check (char_length(trim(texto)) between 3 and 1000)
);

-- Para las bases creadas con la versión anterior.
alter table public.dictamen_puntos
  add column if not exists nota text,
  add column if not exists corregida_at timestamptz;

-- El mismo caso que en dictamenes: el check de esta tabla nació con
-- cuatro estados y "corregido" en masculino. Hoy son dos y la pantalla
-- escribe "corregida", así que marcar una observación como corregida
-- tronaba. Las que ya estuvieran marcadas con el nombre viejo se pasan al
-- nuevo antes de rehacer el check, porque son la misma cosa dicha de otra
-- manera y no hay razón para dejarlas fuera.
update public.dictamen_puntos set estado = 'corregida'
  where estado in ('corregido', 'subsanado');

alter table public.dictamen_puntos drop constraint if exists dictamen_puntos_estado_check;
alter table public.dictamen_puntos
  add constraint dictamen_puntos_estado_check
  check (estado in ('pendiente', 'corregida'))
  not valid;

do $$
begin
  alter table public.dictamen_puntos validate constraint dictamen_puntos_estado_check;
exception when others then
  raise notice 'Quedaron observaciones con un estado que ya no existe. El check queda activo para lo nuevo.';
end $$;

create index if not exists idx_dictamen_puntos_dictamen
  on public.dictamen_puntos(dictamen_id, orden);
-- Para el tablero de "qué trae atorada la oficina", que pregunta por
-- estado sin importar de qué dictamen sea.
create index if not exists idx_dictamen_puntos_estado
  on public.dictamen_puntos(estado);

alter table public.dictamen_puntos enable row level security;

-- Se ve una observación si se ve su dictamen. Toda la regla de acceso vive
-- en la tabla de arriba, para que no haya dos criterios que mantener al
-- día.
drop policy if exists "select_por_dictamen" on public.dictamen_puntos;
create policy "select_por_dictamen" on public.dictamen_puntos
  for select to authenticated using (public.is_staff_or_above());

drop policy if exists "escribe_dictaminador" on public.dictamen_puntos;
create policy "escribe_dictaminador" on public.dictamen_puntos
  for all to authenticated
  using (public.puede_dictaminar()) with check (public.puede_dictaminar());

drop trigger if exists set_dictamen_puntos_updated_at on public.dictamen_puntos;
create trigger set_dictamen_puntos_updated_at
  before update on public.dictamen_puntos
  for each row execute function public.set_updated_at();

-- La fecha de corregida la pone la base, no la pantalla: así queda aunque
-- el punto se mueva desde otro lado, y no se recorre cada vez que se
-- guarda una nota.
create or replace function public.dictamen_punto_fechas()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    new.corregida_at := case when new.estado = 'corregida' then now() else null end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dictamen_punto_fechas on public.dictamen_puntos;
create trigger trg_dictamen_punto_fechas
  before update on public.dictamen_puntos
  for each row execute function public.dictamen_punto_fechas();

-- Las versiones anteriores calculaban solas el estado del dictamen a
-- partir de sus puntos. Se quita: el estado es una decisión de quien
-- dictamina, y un cálculo automático se la quitaría de las manos justo
-- en el momento en que la tiene que tomar.
drop trigger if exists trg_dictamen_punto_movido on public.dictamen_puntos;
drop function if exists public.dictamen_punto_movido();
drop function if exists public.dictamen_recalcular_estado(uuid);

-- ─────────────────────────────────────────────────────────────
-- 6) Dictaminar: poner folio y estado
-- ─────────────────────────────────────────────────────────────
-- El folio se arma DTM + consecutivo + iniciales del asesor. Por ejemplo
-- DTM01DBLG es el primer dictamen (01) de Daniel Barush López Guerrero
-- (DBLG).
--
-- Se genera aquí y no en la pantalla porque el consecutivo tiene que ser
-- único: calculado en el navegador, dos personas guardando al mismo
-- tiempo sacarían el mismo número.
create or replace function public.dictaminar(p_id uuid, p_estado text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_dic public.dictamenes%rowtype;
  v_folio text;
  v_iniciales text;
  v_n integer;
begin
  if not public.puede_dictaminar() then
    raise exception 'No tienes permiso para dictaminar';
  end if;
  if p_estado not in ('devuelta', 'condicionada', 'autorizada') then
    raise exception 'Estado de dictamen no reconocido: %', p_estado;
  end if;

  select * into v_dic from public.dictamenes where id = p_id;
  if not found then raise exception 'Ese dictamen no existe'; end if;

  -- El folio se pone una sola vez. Si ya lo tiene, cambiar de estado no se
  -- lo cambia: el folio es el nombre del documento, y un documento que ya
  -- circuló no puede cambiar de nombre.
  if v_dic.folio is null then
    select coalesce(string_agg(left(palabra, 1), '' order by orden), 'XX')
    into v_iniciales
    from (
      select palabra, orden
      from unnest(regexp_split_to_array(
             upper(trim((select nombre from public.dictamen_asesores where id = v_dic.asesor_id))),
             '\s+')) with ordinality as t(palabra, orden)
      where palabra <> ''
      limit 4
    ) p;

    select count(*) + 1 into v_n
    from public.dictamenes where folio is not null;

    v_folio := 'DTM' || lpad(v_n::text, 2, '0') || v_iniciales;
  else
    v_folio := v_dic.folio;
  end if;

  update public.dictamenes
  set estado = p_estado,
      folio = v_folio,
      dictaminado_at = coalesce(dictaminado_at, now()),
      updated_at = now()
  where id = p_id;

  return v_folio;
end;
$$;

grant execute on function public.dictaminar(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 7) Avisos
-- ─────────────────────────────────────────────────────────────
-- Se apoyan en la tabla de notificaciones, que ya manda correo sola por el
-- trigger de 036_notificar_email_trigger.sql.
--
-- Mientras los asesores no entren a la plataforma, el aviso es para el
-- liderazgo: es quien tiene que enterarse de que un expediente se
-- dictaminó y en qué quedó.
create or replace function public.notificar_dictamen()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_asesor text;
  v_como text;
begin
  if new.estado = 'borrador' or new.estado is not distinct from old.estado then
    return new;
  end if;

  select nombre into v_asesor from public.dictamen_asesores where id = new.asesor_id;
  v_como := case new.estado
    when 'devuelta' then 'Devuelto'
    when 'condicionada' then 'Autorizado condicionado'
    else 'Autorizado para promoción'
  end;

  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  select p.id, 'dictamen', v_como || ': ' || new.inmueble,
         'Expediente de ' || coalesce(v_asesor, 'un asesor') ||
           '. Folio ' || coalesce(new.folio, 'sin folio') || '.',
         '/kwpremierweb/hub/dictamenes.html'
  from public.profiles p
  where p.role in ('master', 'admin', 'staff')
    and p.id is distinct from auth.uid();

  return new;
end;
$$;

drop trigger if exists trg_notificar_dictamen on public.dictamenes;
create trigger trg_notificar_dictamen
  after update on public.dictamenes
  for each row execute function public.notificar_dictamen();

-- Los triggers de las versiones anteriores, que avisaban al asesor por
-- correo. Mientras no tenga cuenta no hay a quién avisarle.
drop trigger if exists trg_notificar_dictamen_entregado on public.dictamenes;
drop trigger if exists trg_notificar_dictamen_en_revision on public.dictamenes;
drop trigger if exists trg_notificar_dictamen_cerrado on public.dictamenes;
drop trigger if exists trg_notificar_punto_regresado on public.dictamen_puntos;
drop function if exists public.notificar_dictamen_entregado();
drop function if exists public.notificar_dictamen_en_revision();
drop function if exists public.notificar_dictamen_cerrado();
drop function if exists public.notificar_punto_regresado();
drop function if exists public.entregar_dictamen(uuid);

-- ─────────────────────────────────────────────────────────────
-- 8) La lista, con los nombres y las cuentas ya hechas
-- ─────────────────────────────────────────────────────────────
-- La pantalla necesita, por cada dictamen, de quién es y cómo va. Sin esto
-- tendría que pedir los asesores por separado y contar las observaciones
-- de cada uno: con cien dictámenes son doscientas consultas.
--
-- El control de acceso NO va aquí: las vistas corren con los permisos de
-- quien las creó, así que la restricción de siempre vive en el WHERE.
--
-- Se borra antes de crear: "create or replace view" solo deja AGREGAR
-- columnas al final, nunca cambiarles el orden ni el nombre. Como el
-- orden de esta vista cambió entre versiones de este archivo (ahora
-- "fecha_dictamen" entra donde antes iba "inmueble"), reemplazarla sin
-- más truena. Borrarla primero es seguro: es una vista de solo lectura,
-- no se pierde ningún dato al recrearla.
drop view if exists public.dictamenes_con_asesor;

create or replace view public.dictamenes_con_asesor as
select
  d.id, d.folio, d.asesor_id, d.dictaminado_por,
  d.fecha_dictamen, d.cliente, d.inmueble,
  d.operacion, d.uso, d.tipo_inmueble_id,
  d.escritura_propiedad, d.escritura_condominio, d.cfdi,
  d.superficie_escritura, d.cuenta_predial, d.superficie_predial,
  d.estado_civil, d.folio_real, d.observaciones,
  d.estado, d.archivado_at, d.dictaminado_at,
  d.created_at, d.updated_at,
  a.nombre          as asesor_nombre,
  a.correo          as asesor_correo,
  t.nombre          as tipo_inmueble,
  q.nombre          as dictaminador_nombre,
  q.apellido        as dictaminador_apellido,
  coalesce(c.total, 0)       as puntos_total,
  coalesce(c.pendientes, 0)  as puntos_pendientes,
  coalesce(c.corregidas, 0)  as puntos_corregidas
from public.dictamenes d
join public.dictamen_asesores a on a.id = d.asesor_id
left join public.dictamen_tipos_inmueble t on t.id = d.tipo_inmueble_id
left join public.profiles q on q.id = d.dictaminado_por
left join lateral (
  select
    count(*)                                    as total,
    count(*) filter (where estado = 'pendiente') as pendientes,
    count(*) filter (where estado = 'corregida') as corregidas
  from public.dictamen_puntos pt
  where pt.dictamen_id = d.id
) c on true
where public.is_staff_or_above();

grant select on public.dictamenes_con_asesor to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 9) Encender y apagar el permiso de dictaminar
-- ─────────────────────────────────────────────────────────────
-- Va como función y no como política de update sobre profiles porque esa
-- tabla solo deja que cada quien toque su propio renglón, a propósito:
-- abrirla para que Admin edite perfiles ajenos le daría de pasada permiso
-- sobre el rol, el correo y todo lo demás.
create or replace function public.set_puede_dictaminar(p_user uuid, p_valor boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin_or_master() then
    raise exception 'Solo Master y Admin pueden dar o quitar este permiso';
  end if;
  update public.profiles set puede_dictaminar = coalesce(p_valor, false)
  where id = p_user;
end;
$$;

grant execute on function public.set_puede_dictaminar(uuid, boolean) to authenticated;
