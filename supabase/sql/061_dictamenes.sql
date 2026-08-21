-- Fase 34: dictámenes de expedientes.
--
-- Hoy el dictamen de un expediente se escribe a mano, se escanea con el
-- teléfono, se manda a recepción y de ahí sale un correo al asesor con
-- copia a medio liderazgo. El PDF llega, sí, pero ahí muere: nadie sabe
-- si el asesor corrigió lo que se le pidió, ni cuánto lleva atorado, ni
-- qué expedientes traen pendientes hoy.
--
-- Por eso el corazón de esto NO es el documento, son los puntos. Cada
-- observación es su propio renglón con su propio estado, y de ahí sale
-- todo lo demás: el PDF, el semáforo del expediente y la respuesta a
-- "¿qué trae atorada la oficina?".
--
-- ─────────────────────────────────────────────────────────────
-- POR QUÉ LOS PUNTOS VAN EN SU PROPIA TABLA
-- ─────────────────────────────────────────────────────────────
-- Cabrían como una lista dentro del dictamen, y sería menos código. Pero
-- entonces marcar un punto significaría reescribir la lista entera, y
-- dos personas trabajando el mismo expediente al mismo tiempo se
-- pisarían: la última en guardar borraría lo que hizo la otra. Además no
-- habría manera de preguntar "cuántos puntos llevan más de un mes sin
-- subsanar" sin recorrer todos los dictámenes a mano.
--
-- ─────────────────────────────────────────────────────────────
-- EL CAMINO DE UN PUNTO
-- ─────────────────────────────────────────────────────────────
--   pendiente   recién levantado, el asesor tiene que hacer algo
--   corregido   el asesor dice que ya; espera revisión (lo ve todo mundo)
--   subsanado   quien dictamina lo revisó y lo dio por bueno
--   no_aplica   se levantó de más, o dejó de tener sentido
--
-- El paso de en medio es a propósito. Sin él, "subsanado" querría decir
-- nada más que el asesor dice que lo hizo, que es justo lo que hoy no se
-- puede comprobar. Solo quien dictamina pasa un punto a subsanado, y
-- puede regresarlo a pendiente con una nota si no quedó bien.
--
-- ─────────────────────────────────────────────────────────────
-- QUIÉN DICTAMINA
-- ─────────────────────────────────────────────────────────────
-- No es un rol nuevo: es un permiso suelto sobre el perfil, que Master y
-- Admin encienden y apagan desde el Panel. Hoy lo trae una sola persona
-- (la abogada), pero si se va de vacaciones o entra alguien más al
-- equipo legal, no hay que tocar la base de datos para que pueda
-- trabajar.
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
  'Puede levantar dictámenes y dar por subsanados sus puntos. Lo encienden Master y Admin desde el Panel. Master lo trae siempre.';

-- Master lo trae encendido de entrada. La función de abajo lo dejaría
-- pasar de todos modos, pero entonces el Panel enseñaría la casilla
-- apagada para alguien que sí puede: el dato tiene que decir lo mismo
-- que el sistema hace.
update public.profiles set puede_dictaminar = true
where role = 'master' and puede_dictaminar = false;

-- Master entra siempre, tenga o no el permiso encendido. Es la cuenta
-- dueña del sistema: si el único perfil con permiso se borra o se apaga
-- por error, sin esto nadie podría volver a encenderlo desde el sitio.
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
-- prenderle la casilla. El "update" de arriba solo arregla a los de hoy.
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
-- 2) El dictamen
-- ─────────────────────────────────────────────────────────────

create table if not exists public.dictamenes (
  id uuid primary key default gen_random_uuid(),

  -- El folio se pone al publicarlo, no al crearlo: un borrador que se
  -- descarta no debe gastarse un número de la serie.
  folio text unique,

  -- De quién es el expediente. Es lo que decide quién puede verlo, así
  -- que no puede quedar vacío.
  asesor_id uuid not null references public.profiles(id) on delete cascade,

  -- Quién lo levantó. Se conserva aunque esa persona salga de la
  -- oficina: el dictamen sigue siendo constancia de lo que se revisó.
  dictaminado_por uuid references public.profiles(id) on delete set null,

  inmueble text not null,
  operacion text not null default 'venta'
    check (operacion in ('venta', 'renta', 'otro')),

  -- ── Los datos del expediente ──
  -- Son los renglones del machote que la abogada llena a mano hoy. Van
  -- todos como texto libre y todos opcionales, a propósito: "Escritura
  -- 25,928 de fecha 01 de agosto del 2000" no es una fecha, y un
  -- expediente a medio revisar tiene huecos por definición. Obligar a
  -- llenarlos volvería el formato una carrera de obstáculos justo cuando
  -- lo que falta ES el hallazgo.
  cliente text,
  escritura_propiedad text,
  escritura_condominio text,
  cfdi text,
  superficie_escritura text,
  cuenta_predial text,
  superficie_predial text,
  estado_civil text,
  folio_real text,

  -- Lo que no cabe en un punto del checklist: el resumen de la revisión.
  observaciones text,

  -- El renglón de autorización del machote. Va aparte de las
  -- observaciones porque no dice qué falta, dice bajo qué condición se
  -- deja pasar el expediente.
  autorizacion text,

  -- borrador   se está armando, el asesor todavía no lo ve
  -- abierto    entregado, con puntos por resolver
  -- en_revision  el asesor ya movió todo lo suyo y espera revisión
  -- cerrado    no queda nada pendiente
  estado text not null default 'borrador'
    check (estado in ('borrador', 'abierto', 'en_revision', 'cerrado')),

  entregado_at timestamptz,
  cerrado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint dictamenes_inmueble_largo check (char_length(trim(inmueble)) between 3 and 200)
);

-- Los datos del expediente, otra vez, para las bases donde la tabla ya se
-- creó con una versión anterior de este archivo. "create table if not
-- exists" no agrega columnas a una tabla que ya está, así que sin esto
-- volver a correrlo no serviría de nada ahí.
alter table public.dictamenes
  add column if not exists cliente text,
  add column if not exists escritura_propiedad text,
  add column if not exists escritura_condominio text,
  add column if not exists cfdi text,
  add column if not exists superficie_escritura text,
  add column if not exists cuenta_predial text,
  add column if not exists superficie_predial text,
  add column if not exists estado_civil text,
  add column if not exists folio_real text,
  add column if not exists autorizacion text;

create index if not exists idx_dictamenes_asesor
  on public.dictamenes(asesor_id, created_at desc);
create index if not exists idx_dictamenes_estado
  on public.dictamenes(estado, created_at desc);

alter table public.dictamenes enable row level security;

-- El asesor ve los suyos, y solo a partir de que se le entregan: un
-- borrador a medio escribir no es un dictamen todavía. El liderazgo ve
-- todo, incluidos los borradores.
drop policy if exists "select_propios_o_liderazgo" on public.dictamenes;
create policy "select_propios_o_liderazgo" on public.dictamenes
  for select to authenticated
  using (
    public.is_staff_or_above()
    or (asesor_id = auth.uid() and estado <> 'borrador')
  );

drop policy if exists "insert_dictaminador" on public.dictamenes;
create policy "insert_dictaminador" on public.dictamenes
  for insert to authenticated
  with check (public.puede_dictaminar() and dictaminado_por = auth.uid());

-- Un dictamen cerrado ya no se toca: es la constancia de que el
-- expediente quedó en orden. Para corregir algo después se levanta otro.
drop policy if exists "update_dictaminador" on public.dictamenes;
create policy "update_dictaminador" on public.dictamenes
  for update to authenticated
  using (public.puede_dictaminar() and estado <> 'cerrado');

-- Borrar solo lo que nunca se entregó. Lo demás se cierra, no se borra:
-- si un dictamen entregado desapareciera, el asesor se quedaría con
-- correcciones que nadie le puede explicar de dónde salieron.
drop policy if exists "delete_borradores" on public.dictamenes;
create policy "delete_borradores" on public.dictamenes
  for delete to authenticated
  using (public.puede_dictaminar() and estado = 'borrador');

drop trigger if exists set_dictamenes_updated_at on public.dictamenes;
create trigger set_dictamenes_updated_at
  before update on public.dictamenes
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 3) Los puntos del checklist
-- ─────────────────────────────────────────────────────────────

create table if not exists public.dictamen_puntos (
  id uuid primary key default gen_random_uuid(),
  dictamen_id uuid not null references public.dictamenes(id) on delete cascade,

  -- El orden lo pone quien dictamina: en el PDF se lee como una lista
  -- numerada, y ahí sí importa cuál va primero.
  orden integer not null default 0,

  texto text not null,

  -- Para agrupar en el PDF y poder filtrar después. Es texto libre
  -- acotado y no una tabla aparte: son cuatro cajones que no cambian.
  categoria text not null default 'documento'
    check (categoria in ('documento', 'acuerdo', 'legal', 'otro')),

  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'corregido', 'subsanado', 'no_aplica')),

  -- Lo que el asesor contesta al marcarlo corregido ("ya subí la boleta
  -- al Drive"), y lo que quien dictamina le responde si lo regresa.
  nota_asesor text,
  nota_revision text,

  corregido_at timestamptz,
  subsanado_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint dictamen_puntos_texto_largo check (char_length(trim(texto)) between 3 and 1000)
);

create index if not exists idx_dictamen_puntos_dictamen
  on public.dictamen_puntos(dictamen_id, orden);
-- Para el tablero de "qué trae atorada la oficina", que pregunta por
-- estado sin importar de qué dictamen sea.
create index if not exists idx_dictamen_puntos_estado
  on public.dictamen_puntos(estado);

alter table public.dictamen_puntos enable row level security;

-- Se ve un punto si se ve su dictamen. Toda la regla de acceso vive en
-- la tabla de arriba, para que no haya dos criterios que mantener al día.
drop policy if exists "select_por_dictamen" on public.dictamen_puntos;
create policy "select_por_dictamen" on public.dictamen_puntos
  for select to authenticated
  using (exists (
    select 1 from public.dictamenes d
    where d.id = dictamen_id
      and (public.is_staff_or_above()
           or (d.asesor_id = auth.uid() and d.estado <> 'borrador'))
  ));

drop policy if exists "insert_dictaminador" on public.dictamen_puntos;
create policy "insert_dictaminador" on public.dictamen_puntos
  for insert to authenticated
  with check (public.puede_dictaminar());

-- Aquí está el candado del proceso.
--
-- Quien dictamina mueve lo que quiera. El asesor solo puede tocar SUS
-- puntos, y solo por el carril que le toca: de pendiente a corregido, o
-- de corregido a pendiente si se arrepintió. Nunca a subsanado.
--
-- El "with check" es el que hace el trabajo: sin él, el asesor podría
-- leer un punto pendiente (que la parte de "using" le permite) y
-- guardarlo como subsanado, que es exactamente lo que este diseño
-- existe para impedir.
drop policy if exists "update_dictaminador_o_asesor" on public.dictamen_puntos;
create policy "update_dictaminador_o_asesor" on public.dictamen_puntos
  for update to authenticated
  using (
    public.puede_dictaminar()
    or exists (
      select 1 from public.dictamenes d
      where d.id = dictamen_id
        and d.asesor_id = auth.uid()
        and d.estado not in ('borrador', 'cerrado')
    )
  )
  with check (
    public.puede_dictaminar()
    or (
      estado in ('pendiente', 'corregido')
      and exists (
        select 1 from public.dictamenes d
        where d.id = dictamen_id
          and d.asesor_id = auth.uid()
          and d.estado not in ('borrador', 'cerrado')
      )
    )
  );

drop policy if exists "delete_dictaminador" on public.dictamen_puntos;
create policy "delete_dictaminador" on public.dictamen_puntos
  for delete to authenticated
  using (public.puede_dictaminar());

drop trigger if exists set_dictamen_puntos_updated_at on public.dictamen_puntos;
create trigger set_dictamen_puntos_updated_at
  before update on public.dictamen_puntos
  for each row execute function public.set_updated_at();

-- Las fechas del camino las pone la base, no la pantalla: así quedan
-- aunque el punto se mueva desde otro lado, y no se recorren cada vez
-- que se guarda una nota.
create or replace function public.dictamen_punto_fechas()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado = 'corregido' then new.corregido_at := now(); end if;
    if new.estado = 'subsanado' then new.subsanado_at := now(); end if;
    -- Regresarlo a pendiente borra el rastro del intento anterior: si se
    -- quedara la fecha, el punto se vería subsanado en los reportes
    -- aunque esté abierto otra vez.
    if new.estado = 'pendiente' then
      new.corregido_at := null;
      new.subsanado_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dictamen_punto_fechas on public.dictamen_puntos;
create trigger trg_dictamen_punto_fechas
  before update on public.dictamen_puntos
  for each row execute function public.dictamen_punto_fechas();

-- ─────────────────────────────────────────────────────────────
-- 4) El estado del dictamen sale de sus puntos
-- ─────────────────────────────────────────────────────────────
-- Nadie lo mueve a mano, porque a mano se olvida: el expediente se
-- quedaría "abierto" para siempre aunque ya no le falte nada. Se
-- recalcula cada vez que un punto cambia.
--
-- Un dictamen entregado está cerrado cuando ninguno de sus puntos sigue
-- esperando algo; en revisión cuando el asesor ya movió todo lo suyo y
-- la pelota está del lado de quien dictamina; abierto mientras al asesor
-- le falte algo por hacer.
create or replace function public.dictamen_recalcular_estado(p_dictamen uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_estado text;
  v_pendientes integer;
  v_corregidos integer;
  v_nuevo text;
begin
  select estado into v_estado from public.dictamenes where id = p_dictamen;
  -- Un borrador no tiene estado que calcular: todavía no es de nadie.
  if v_estado is null or v_estado = 'borrador' then return; end if;

  select
    count(*) filter (where estado = 'pendiente'),
    count(*) filter (where estado = 'corregido')
  into v_pendientes, v_corregidos
  from public.dictamen_puntos
  where dictamen_id = p_dictamen;

  v_nuevo := case
    when v_pendientes > 0 then 'abierto'
    when v_corregidos > 0 then 'en_revision'
    else 'cerrado'
  end;

  if v_nuevo is distinct from v_estado then
    update public.dictamenes
    set estado = v_nuevo,
        cerrado_at = case when v_nuevo = 'cerrado' then now() else null end,
        updated_at = now()
    where id = p_dictamen;
  end if;
end;
$$;

create or replace function public.dictamen_punto_movido()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.dictamen_recalcular_estado(
    coalesce(new.dictamen_id, old.dictamen_id));
  return null;
end;
$$;

drop trigger if exists trg_dictamen_punto_movido on public.dictamen_puntos;
create trigger trg_dictamen_punto_movido
  after insert or update or delete on public.dictamen_puntos
  for each row execute function public.dictamen_punto_movido();

-- ─────────────────────────────────────────────────────────────
-- 5) Entregar el dictamen
-- ─────────────────────────────────────────────────────────────
-- Pasa de borrador a la vista del asesor y le pone folio. Es un paso
-- aparte y no un update cualquiera porque es el momento en que el
-- dictamen deja de ser un apunte y se vuelve algo que alguien tiene que
-- atender: de aquí salen el correo y la campanita.
create or replace function public.entregar_dictamen(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_dic public.dictamenes%rowtype;
  v_folio text;
  v_cuantos integer;
begin
  if not public.puede_dictaminar() then
    raise exception 'No tienes permiso para dictaminar';
  end if;

  select * into v_dic from public.dictamenes where id = p_id;
  if not found then raise exception 'Ese dictamen no existe'; end if;
  if v_dic.estado <> 'borrador' then return v_dic.folio; end if;

  select count(*) into v_cuantos
  from public.dictamen_puntos where dictamen_id = p_id;
  if v_cuantos = 0 then
    raise exception 'Un dictamen sin observaciones no tiene qué entregar';
  end if;

  -- Folio DIC-AÑO-####, con su propia serie: mezclarlo con el de los
  -- documentos haría que los números saltaran sin explicación.
  select 'DIC-' || to_char(now(), 'YYYY') || '-' ||
         lpad((count(*) + 1)::text, 4, '0')
  into v_folio
  from public.dictamenes
  where folio is not null
    and date_part('year', entregado_at) = date_part('year', now());

  update public.dictamenes
  set estado = 'abierto',
      folio = v_folio,
      entregado_at = now(),
      updated_at = now()
  where id = p_id;

  -- Y que el estado cuadre desde el primer momento: si todos los puntos
  -- nacieron marcados "no aplica", el dictamen ya nace cerrado.
  perform public.dictamen_recalcular_estado(p_id);

  return v_folio;
end;
$$;

grant execute on function public.entregar_dictamen(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6) Avisos
-- ─────────────────────────────────────────────────────────────
-- Se apoyan en la tabla de notificaciones, que ya manda correo sola por
-- el trigger de 036_notificar_email_trigger.sql. Eso es justo lo que
-- sustituye al correo a mano con copia a medio mundo.

-- 6.1) Dictamen entregado -> al asesor, y al liderazgo de enterado.
create or replace function public.notificar_dictamen_entregado()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_asesor text;
begin
  if new.estado = 'borrador' or old.estado <> 'borrador' then
    return new;
  end if;

  select coalesce(nullif(trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')), ''), email)
  into v_asesor
  from public.profiles where id = new.asesor_id;

  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  values (
    new.asesor_id, 'dictamen_nuevo',
    'Dictamen de tu expediente: ' || new.inmueble,
    'Se revisó tu expediente y hay observaciones que atender. Folio ' ||
      coalesce(new.folio, 'sin folio') || '.',
    '/kwpremierweb/hub/dictamenes.html'
  );

  -- La copia al liderazgo, que es lo que hoy se hace poniendo a todos en
  -- el "CC". Se salta a quien lo levantó: ya sabe.
  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  select p.id, 'dictamen_nuevo',
         'Nuevo dictamen: ' || new.inmueble,
         'Expediente de ' || coalesce(v_asesor, 'un asesor') || '.',
         '/kwpremierweb/hub/dictamenes.html'
  from public.profiles p
  where p.role in ('master', 'admin', 'staff')
    and p.id is distinct from new.dictaminado_por
    and p.id is distinct from new.asesor_id;

  return new;
end;
$$;

drop trigger if exists trg_notificar_dictamen_entregado on public.dictamenes;
create trigger trg_notificar_dictamen_entregado
  after update on public.dictamenes
  for each row execute function public.notificar_dictamen_entregado();

-- 6.2) El asesor marcó algo corregido -> a quien puede revisarlo.
--
-- Un aviso por punto sería una lluvia de correos: un expediente con ocho
-- observaciones mandaría ocho. Solo se avisa cuando ya no queda nada
-- pendiente, que es cuando de verdad hay algo que sentarse a revisar.
create or replace function public.notificar_dictamen_en_revision()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_asesor text;
begin
  if new.estado <> 'en_revision' or old.estado = 'en_revision' then
    return new;
  end if;

  select coalesce(nullif(trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')), ''), email)
  into v_asesor
  from public.profiles where id = new.asesor_id;

  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  select p.id, 'dictamen_en_revision',
         'Listo para revisar: ' || new.inmueble,
         coalesce(v_asesor, 'El asesor') || ' marcó como corregidas todas las observaciones.',
         '/kwpremierweb/hub/dictamenes.html'
  from public.profiles p
  where (p.puede_dictaminar = true or p.role = 'master')
    and p.id is distinct from new.asesor_id;

  return new;
end;
$$;

drop trigger if exists trg_notificar_dictamen_en_revision on public.dictamenes;
create trigger trg_notificar_dictamen_en_revision
  after update on public.dictamenes
  for each row execute function public.notificar_dictamen_en_revision();

-- 6.3) Le regresaron un punto al asesor -> se le avisa.
--
-- Este es el aviso que hoy no existe de ninguna forma: el asesor manda
-- su corrección por correo y nunca se entera de que no quedó bien.
create or replace function public.notificar_punto_regresado()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_dic public.dictamenes%rowtype;
begin
  if not (old.estado = 'corregido' and new.estado = 'pendiente') then
    return new;
  end if;

  select * into v_dic from public.dictamenes where id = new.dictamen_id;
  if v_dic.asesor_id = auth.uid() then return new; end if;

  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  values (
    v_dic.asesor_id, 'dictamen_punto_regresado',
    'Te regresaron una corrección: ' || v_dic.inmueble,
    coalesce(nullif(trim(coalesce(new.nota_revision, '')), ''), left(new.texto, 120)),
    '/kwpremierweb/hub/dictamenes.html'
  );
  return new;
end;
$$;

drop trigger if exists trg_notificar_punto_regresado on public.dictamen_puntos;
create trigger trg_notificar_punto_regresado
  after update on public.dictamen_puntos
  for each row execute function public.notificar_punto_regresado();

-- 6.4) Dictamen cerrado -> al asesor, que se enteró de que abrió y
-- merece enterarse de que cerró.
create or replace function public.notificar_dictamen_cerrado()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.estado <> 'cerrado' or old.estado = 'cerrado' then
    return new;
  end if;

  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  values (
    new.asesor_id, 'dictamen_cerrado',
    'Expediente en orden: ' || new.inmueble,
    'Se subsanaron todas las observaciones del dictamen ' ||
      coalesce(new.folio, '') || '.',
    '/kwpremierweb/hub/dictamenes.html'
  );
  return new;
end;
$$;

drop trigger if exists trg_notificar_dictamen_cerrado on public.dictamenes;
create trigger trg_notificar_dictamen_cerrado
  after update on public.dictamenes
  for each row execute function public.notificar_dictamen_cerrado();

-- ─────────────────────────────────────────────────────────────
-- 7) La lista, con los nombres y las cuentas ya hechas
-- ─────────────────────────────────────────────────────────────
-- La pantalla necesita, por cada dictamen, de quién es y cómo va. Sin
-- esto tendría que pedir los perfiles por separado y contar los puntos
-- de cada uno: con cien dictámenes son doscientas consultas.
--
-- El control de acceso NO va aquí: las vistas corren con los permisos de
-- quien las creó, así que la restricción de siempre vive en el WHERE,
-- igual que en incidencias_con_reportante.
create or replace view public.dictamenes_con_asesor as
select
  d.id,
  d.folio,
  d.asesor_id,
  d.dictaminado_por,
  d.inmueble,
  d.operacion,
  d.cliente,
  d.escritura_propiedad,
  d.escritura_condominio,
  d.cfdi,
  d.superficie_escritura,
  d.cuenta_predial,
  d.superficie_predial,
  d.estado_civil,
  d.folio_real,
  d.observaciones,
  d.autorizacion,
  d.estado,
  d.entregado_at,
  d.cerrado_at,
  d.created_at,
  d.updated_at,
  p.nombre        as asesor_nombre,
  p.apellido      as asesor_apellido,
  p.email         as asesor_email,
  q.nombre        as dictaminador_nombre,
  q.apellido      as dictaminador_apellido,
  coalesce(c.total, 0)      as puntos_total,
  coalesce(c.pendientes, 0) as puntos_pendientes,
  coalesce(c.corregidos, 0) as puntos_corregidos,
  coalesce(c.subsanados, 0) as puntos_subsanados
from public.dictamenes d
join public.profiles p on p.id = d.asesor_id
left join public.profiles q on q.id = d.dictaminado_por
left join lateral (
  select
    count(*)                                   as total,
    count(*) filter (where estado = 'pendiente') as pendientes,
    count(*) filter (where estado = 'corregido') as corregidos,
    count(*) filter (where estado = 'subsanado') as subsanados
  from public.dictamen_puntos pt
  where pt.dictamen_id = d.id
) c on true
where public.is_staff_or_above()
   or (d.asesor_id = auth.uid() and d.estado <> 'borrador');

grant select on public.dictamenes_con_asesor to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8) A quién se le puede levantar un dictamen
-- ─────────────────────────────────────────────────────────────
-- La pantalla necesita la lista del equipo para el desplegable de
-- "asesor del expediente". La tabla de perfiles no sirve: solo deja leer
-- el propio renglón y el de Admin para arriba, y quien dictamina bien
-- puede ser Liderazgo. Y perfiles_publicos tampoco, porque esconde a
-- quien está marcado como oculto, y a esa persona igual hay que poder
-- revisarle un expediente.
create or replace view public.dictamen_asesores as
select p.id, p.nombre, p.apellido, p.email, p.role
from public.profiles p
where public.puede_dictaminar() or public.is_staff_or_above();

grant select on public.dictamen_asesores to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 9) Encender y apagar el permiso
-- ─────────────────────────────────────────────────────────────
-- Va como función y no como política de update sobre profiles porque
-- esa tabla solo deja que cada quien toque su propio renglón, a
-- propósito: abrirla para que Admin edite perfiles ajenos le daría de
-- pasada permiso sobre el rol, el correo y todo lo demás.
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
