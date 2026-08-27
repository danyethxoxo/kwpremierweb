-- ═════════════════════════════════════════════════════════════
-- 072 · Operatividad: el control de captaciones del Market Center
-- ═════════════════════════════════════════════════════════════
--
-- Como todos los de esta carpeta, se puede volver a correr sin romper
-- nada ni pisar lo que ya se haya capturado.
--
-- ─────────────────────────────────────────────────────────────
-- QUÉ ES ESTO
-- ─────────────────────────────────────────────────────────────
-- Hoy la administración del MC lleva a mano una hoja de cálculo con un
-- renglón por captación: quién la trajo, qué folio le tocó, cuándo se
-- firmó el contrato, en cuánto, a qué porcentaje, dónde está el inmueble
-- y cómo va su dictamen. Esa hoja se llena copiando de los acuerdos y
-- contratos que los asociados generan aquí mismo, así que se desfasa en
-- cuanto alguien se salta el copiado.
--
-- Esta tabla es esa hoja, pero llenándose sola: cada vez que un acuerdo o
-- contrato se finaliza (que es cuando deja de ser borrador y se gana su
-- folio), nace o se pone al día su renglón con lo que el documento ya
-- traía adentro. Lo que el documento no sabe (si la firma fue digital o
-- autógrafa, cómo va en Command, la división) se escribe a mano encima, y
-- esa escritura a mano gana para siempre.
--
-- ─────────────────────────────────────────────────────────────
-- POR QUÉ UNA TABLA Y NO UNA VISTA SOBRE LOS DOCUMENTOS
-- ─────────────────────────────────────────────────────────────
-- Una vista saldría gratis y estaría siempre al día, pero no se puede
-- editar, y varias columnas de la hoja no salen de ningún documento:
-- nacen del seguimiento posterior. Además un renglón tiene que poder
-- existir sin documento (captaciones viejas, o firmadas en papel antes de
-- que existiera el sitio) y tiene que sobrevivir a que alguien borre el
-- documento del que salió.
--
-- ─────────────────────────────────────────────────────────────
-- POR QUÉ AL FINALIZAR Y NO AL GUARDAR
-- ─────────────────────────────────────────────────────────────
-- Un borrador es medio documento: se abre, se llena a la mitad, se
-- abandona y se vuelve a empezar. Si cada uno abriera renglón, la hoja
-- que quiere ser el control de la oficina se llenaría de basura. Al
-- finalizar, en cambio, el documento ya tiene folio, ya no se puede
-- editar y representa una captación de verdad.
--
-- Requiere 001_profiles.sql, 002_documentos_guardados.sql,
-- 005_roles_jerarquia.sql, 008_folios_y_finalizado.sql y
-- 061_dictamenes.sql.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

-- ─────────────────────────────────────────────────────────────
-- 1) La tabla
-- ─────────────────────────────────────────────────────────────
-- Los nombres de columna siguen el encabezado de la hoja. Dos se tuvieron
-- que renombrar:
--
--   ESTADO  ->  entidad         en este proyecto "estado" siempre quiere
--                               decir en qué va algo (borrador,
--                               finalizado, autorizada). Aquí quiere
--                               decir CDMX o Jalisco, y mezclar los dos
--                               sentidos en una columna que además vive
--                               al lado de estatus_dictamen se lee mal en
--                               cada consulta que se escriba después.
--   %       ->  porcentaje      un identificador no puede llamarse "%".
--
-- Casi todo va como texto libre a propósito. La hoja de la que sale esto
-- lleva años recibiendo lo que cada quien escribe, y cerrar los valores
-- con un check convertiría la primera captura rara en un error en vez de
-- en un renglón que alguien corrige después. Las dos excepciones son
-- precio y porcentaje: sobre esos sí se van a sacar sumas y promedios, y
-- un texto no se suma.
create table if not exists public.operatividad (
  id uuid primary key default gen_random_uuid(),

  -- De qué documento salió este renglón. Nulo si se capturó a mano.
  -- "on delete set null" y no "cascade": que alguien borre el documento
  -- no borra la captación, nada más deja de saberse de cuál venía.
  documento_id uuid unique references public.documentos_guardados(id) on delete set null,

  -- El dictamen del expediente, cuando se le encuentra. De aquí salen
  -- fecha_dictamen y estatus_dictamen sin que nadie las teclee.
  dictamen_id uuid references public.dictamenes(id) on delete set null,

  -- ── Quién ──
  -- El nombre va aparte del id a propósito: en el documento el asesor se
  -- escribe a mano y no siempre es quien tiene la sesión abierta (una
  -- asistente puede capturar por él), así que el nombre es el dato de la
  -- hoja y el id nada más el rastro de qué cuenta lo generó.
  asociado_id uuid references public.profiles(id) on delete set null,
  asociado_nombre text,

  folio text,

  -- ── El dictamen ──
  fecha_dictamen date,
  estatus_dictamen text,

  -- ── La operación ──
  mes_recibo text,
  fecha_contrato date,
  tipo text,                  -- VENTA / RENTA
  exclusividad text,          -- EXCLUSIVA / OPCIÓN
  division text,              -- RESIDENCIAL / COMERCIAL
  precio numeric(14,2),
  porcentaje numeric(6,3),
  firma text,                 -- DIGITAL / AUTÓGRAFA

  -- ── El inmueble ──
  direccion text,
  colonia text,
  alcaldia text,
  entidad text,
  codigo_postal text,

  -- ── El propietario ──
  cliente_nombre text,
  numero_propietario text,

  estatus_command text,

  -- ── El rastro de quién escribió qué ──
  -- Los nombres de las columnas que una persona corrigió a mano. La
  -- sincronización no vuelve a tocarlas: si la administración arregló la
  -- colonia porque el asesor la escribió mal, ese arreglo no se puede
  -- perder la próxima vez que el documento se vuelva a guardar.
  campos_manuales text[] not null default '{}',
  sincronizado_at timestamptz,

  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Para las bases donde la tabla ya se creó con una versión anterior de
-- este archivo: "create table if not exists" no agrega columnas a una
-- tabla que ya está.
alter table public.operatividad
  add column if not exists dictamen_id uuid references public.dictamenes(id) on delete set null,
  add column if not exists asociado_id uuid references public.profiles(id) on delete set null,
  add column if not exists campos_manuales text[] not null default '{}',
  add column if not exists sincronizado_at timestamptz,
  add column if not exists creado_por uuid references public.profiles(id) on delete set null;

-- La lista se lee siempre por fecha de contrato, de lo más nuevo a lo más
-- viejo, y se filtra por asociado. Los renglones sin fecha (recién
-- nacidos, todavía sin capturar) van primero: son justo los que hay que
-- terminar de llenar.
create index if not exists idx_operatividad_fecha
  on public.operatividad(fecha_contrato desc nulls first);
create index if not exists idx_operatividad_asociado
  on public.operatividad(asociado_id);
create index if not exists idx_operatividad_folio
  on public.operatividad(folio);

drop trigger if exists set_operatividad_updated_at on public.operatividad;
create trigger set_operatividad_updated_at
  before update on public.operatividad
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2) Quién la ve
-- ─────────────────────────────────────────────────────────────
-- Solo el liderazgo. Un asociado no entra aquí ni de lectura: la hoja
-- trae los porcentajes y los precios de todos, y esa comparación entre
-- compañeros no es algo que la oficina quiera repartir. Por eso las
-- pantallas de Acuerdos y Contratos ni siquiera le ofrecen la puerta.
alter table public.operatividad enable row level security;

drop policy if exists "select_liderazgo" on public.operatividad;
create policy "select_liderazgo" on public.operatividad
  for select to authenticated using (public.is_staff_or_above());

drop policy if exists "escribe_liderazgo" on public.operatividad;
create policy "escribe_liderazgo" on public.operatividad
  for all to authenticated
  using (public.is_staff_or_above()) with check (public.is_staff_or_above());

-- ─────────────────────────────────────────────────────────────
-- 3) Marcar lo que se corrigió a mano
-- ─────────────────────────────────────────────────────────────
-- Corre antes de cada update. Si quien escribe es la sincronización, no
-- anota nada; si es una persona, apunta qué columnas cambió para que la
-- sincronización no se las vuelva a pisar.
--
-- La sincronización se anuncia con una bandera que solo vive dentro de su
-- propia transacción (el "true" de set_config). La primera versión de
-- esto la reconocía por otro lado: porque era la única que movía
-- sincronizado_at. No servía, y de la peor manera: now() devuelve la hora
-- en que EMPEZÓ la transacción, así que el insert y el update de una
-- misma sincronización escribían el mismo valor, la columna no cambiaba,
-- y el renglón nacía con TODAS sus columnas marcadas como corregidas a
-- mano. Es decir, la sincronización se autobloqueaba para siempre en el
-- momento mismo de crear el renglón.
create or replace function public.operatividad_marcar_manual()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Las columnas que la sincronización sabe llenar. Las demás
  -- (firma, estatus_command) nunca se pisan, así que no hay nada que
  -- proteger en ellas.
  v_automaticas text[] := array[
    'dictamen_id', 'asociado_nombre', 'folio',
    'fecha_dictamen', 'estatus_dictamen',
    'mes_recibo', 'fecha_contrato', 'tipo', 'exclusividad', 'division',
    'precio', 'porcentaje', 'direccion', 'colonia', 'alcaldia',
    'entidad', 'codigo_postal', 'cliente_nombre', 'numero_propietario'
  ];
  v_nuevo jsonb := to_jsonb(new);
  v_viejo jsonb := to_jsonb(old);
  v_col text;
begin
  if coalesce(current_setting('kw.operatividad_sync', true), '') = 'si' then
    return new;
  end if;

  foreach v_col in array v_automaticas loop
    if (v_nuevo -> v_col) is distinct from (v_viejo -> v_col)
       and not (v_col = any(new.campos_manuales)) then
      new.campos_manuales := new.campos_manuales || v_col;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_operatividad_marcar_manual on public.operatividad;
create trigger trg_operatividad_marcar_manual
  before update on public.operatividad
  for each row execute function public.operatividad_marcar_manual();

-- ─────────────────────────────────────────────────────────────
-- 4) Ayudantes para leer lo que traen los documentos
-- ─────────────────────────────────────────────────────────────
-- Lo que se guarda de un acuerdo es el contenido de sus campos tal cual
-- se tecleó, en un jsonb y todo como texto. Estas funciones lo traducen a
-- lo que la hoja necesita, sin tronar cuando viene vacío o escrito de
-- otra forma: un renglón a medio llenar es normal, y un error aquí
-- abortaría el guardado del documento entero.

-- Texto limpio, o nulo si no hay nada.
create or replace function public.operatividad_texto(p_texto text)
returns text
language sql immutable
as $$
  select nullif(trim(coalesce(p_texto, '')), '');
$$;

-- Un número, aunque venga con signo de pesos, comas o espacios.
create or replace function public.operatividad_numero(p_texto text)
returns numeric
language plpgsql immutable
as $$
declare
  v text := regexp_replace(coalesce(p_texto, ''), '[^0-9.-]', '', 'g');
begin
  if v !~ '^-?[0-9]*\.?[0-9]+$' then return null; end if;
  return v::numeric;
end;
$$;

-- Una fecha. Los campos del sitio son <input type="date">, así que
-- siempre llegan como AAAA-MM-DD, pero se atrapa el error por si un día
-- llega de otro lado.
create or replace function public.operatividad_fecha(p_texto text)
returns date
language plpgsql stable
as $$
begin
  return nullif(trim(coalesce(p_texto, '')), '')::date;
exception when others then
  return null;
end;
$$;

-- El mes en que se espera el recibo. En la hoja es el mes del contrato
-- escrito con letra y en mayúsculas (15/01/2026 -> ENERO), así que se
-- saca de la fecha en vez de pedirlo aparte.
--
-- Los nombres van a mano y no con to_char: el formato TMMonth de Postgres
-- depende de la configuración regional del servidor, y en Supabase esa
-- configuración viene en inglés.
create or replace function public.operatividad_mes(p_fecha date)
returns text
language sql immutable
as $$
  select case when p_fecha is null then null else
    (array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO',
           'AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'])
    [extract(month from p_fecha)::int]
  end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5) Partir la dirección en sus pedazos
-- ─────────────────────────────────────────────────────────────
-- En los documentos la dirección es un solo campo, y su instrucción en
-- pantalla dice "Calle, número, colonia, alcaldía, CP". En la hoja son
-- cinco columnas. Se parte por comas siguiendo justo esa instrucción: el
-- último pedazo es el código postal si parece uno, el que sigue hacia
-- atrás es la alcaldía, el siguiente la colonia y lo que quede al frente
-- es la calle con su número.
--
-- Es una lectura optimista, y se sabe: quien escriba en otro orden va a
-- ver los pedazos cambiados de lugar. No importa, porque todas esas
-- columnas se pueden corregir a mano y la corrección se respeta para
-- siempre. Adivinar bien nueve de cada diez veces ahorra más trabajo del
-- que cuesta arreglar la décima.
create or replace function public.operatividad_partir_direccion(p_texto text)
returns jsonb
language plpgsql immutable
as $$
declare
  v_partes text[];
  v_n int;
  v_cp text;
begin
  select array_agg(trim(x)) into v_partes
  from unnest(string_to_array(coalesce(p_texto, ''), ',')) as x
  where trim(x) <> '';

  v_n := coalesce(array_length(v_partes, 1), 0);
  if v_n = 0 then return '{}'::jsonb; end if;

  -- "11320" y "C.P. 11320" cuentan los dos. La condición de que haya más
  -- de un pedazo evita el caso tonto: una dirección de un solo pedazo con
  -- número de cinco cifras ("Calzada 12345") se leería entera como código
  -- postal y el renglón se quedaría sin calle.
  if v_n > 1 and v_partes[v_n] ~ '^[A-Za-z.[:space:]]*[0-9]{5}$' then
    v_cp := (regexp_match(v_partes[v_n], '([0-9]{5})'))[1];
    v_n := v_n - 1;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'codigo_postal', v_cp,
    'alcaldia',  case when v_n >= 3 then v_partes[v_n] end,
    'colonia',   case when v_n >= 3 then v_partes[v_n - 1]
                      when v_n = 2 then v_partes[2] end,
    'direccion', case when v_n >= 3 then array_to_string(v_partes[1:v_n - 2], ', ')
                      when v_n >= 1 then v_partes[1] end
  ));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6) Encontrarle su dictamen
-- ─────────────────────────────────────────────────────────────
-- El dictamen del expediente ya vive en el sitio (061_dictamenes.sql) y
-- trae la dirección del inmueble escrita otra vez, a mano, por otra
-- persona y en otro momento. Compararlas tal cual no sirve: "Hamburgo
-- 294, Juárez" y "HAMBURGO #294 COL. JUAREZ" son el mismo lugar y no se
-- parecen en nada como texto. Se comparan sin acentos, sin mayúsculas y
-- sin nada que no sea letra o número.
create or replace function public.operatividad_clave(p_texto text)
returns text
language sql immutable
as $$
  select regexp_replace(
           upper(translate(coalesce(p_texto, ''),
                           'áéíóúàèìòùäëïöüÁÉÍÓÚÀÈÌÒÙÄËÏÖÜñÑ',
                           'aeiouaeiouaeiouAEIOUAEIOUAEIOUnN')),
           '[^A-Z0-9]', '', 'g');
$$;

-- Devuelve el dictamen solo cuando hay UNO que empareja. Con dos o más se
-- queda sin enlazar a propósito: enlazar el que no era pondría la fecha y
-- el estatus de otro expediente en este renglón, y eso es peor que
-- dejarlos vacíos para que alguien los llene viendo.
--
-- Lo que se compara es la calle con su número ("HAMBURGO294"), no la
-- dirección completa: colonia, alcaldía y código postal cada quien los
-- escribe distinto ("COL. JUAREZ" contra "Juárez") y meterlos en la
-- comparación la echa a perder justo cuando las dos hablan del mismo
-- lugar. La calle y el número, en cambio, casi siempre coinciden, y por
-- eso alcanza con que uno de los dos textos empiece con el otro.
--
-- El mínimo de ocho caracteres es para que un "REFORMA" suelto no
-- empareje con media ciudad.
create or replace function public.operatividad_buscar_dictamen(p_direccion text)
returns uuid
language plpgsql stable
set search_path = public
as $$
declare
  v_clave text := public.operatividad_clave(p_direccion);
  v_ids uuid[];
begin
  if length(v_clave) < 8 then return null; end if;

  select array_agg(d.id) into v_ids
  from public.dictamenes d
  where d.archivado_at is null
    and (public.operatividad_clave(d.inmueble) like v_clave || '%'
      or v_clave like public.operatividad_clave(d.inmueble) || '%');

  if coalesce(array_length(v_ids, 1), 0) = 1 then return v_ids[1]; end if;
  return null;
end;
$$;

-- El estatus como lo escribe la hoja. Un dictamen en borrador todavía no
-- dice nada, así que devuelve nulo y la columna se queda vacía.
create or replace function public.operatividad_estatus_dictamen(p_estado text)
returns text
language sql immutable
as $$
  select case p_estado
    when 'devuelta'     then 'DEVUELTO'
    when 'condicionada' then 'CONDICIONADO'
    when 'autorizada'   then 'AUTORIZADO'
    else null
  end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 7) Traducir un documento a un renglón de la hoja
-- ─────────────────────────────────────────────────────────────
-- Devuelve nulo cuando el documento no representa una captación. La
-- mayoría no la representa: un aviso de privacidad, un checklist o una
-- carta de terminación son papeles del expediente, no operaciones, y
-- meterlos aquí volvería la hoja una lista de documentos en vez del
-- control de captaciones que se quiere.
--
-- Solo se traducen los dos contratos que sí son una captación. El día que
-- exista el de venta comercial (documentos/contratos/comercial.html
-- todavía está vacío), se agrega su rama aquí y empieza a contar solo.
--
-- Lo que sale de aquí NUNCA lleva nulos (jsonb_strip_nulls al final): la
-- sincronización llena, jamás vacía. Si el asesor dejó el precio en
-- blanco y la administración ya lo había escrito a mano, el renglón se
-- queda con el que sirve.
create or replace function public.operatividad_desde_documento(p_doc public.documentos_guardados)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  d jsonb := coalesce(p_doc.datos, '{}'::jsonb);
  v jsonb;
  v_fecha date;
  v_clientes jsonb;
begin
  v_clientes := case when jsonb_typeof(d -> 'clientes') = 'array'
                     then d -> 'clientes' else '[]'::jsonb end;

  if p_doc.tipo_documento = 'acuerdo_renta' then
    -- Aquí los clientes (arrendadores) se guardan como una lista de
    -- nombres sueltos, sin teléfono: por eso este documento no puede
    -- llenar el número del propietario.
    v_fecha := public.operatividad_fecha(d ->> 'f-fecha');
    v := jsonb_build_object(
      'asociado_nombre', public.operatividad_texto(d ->> 'f-asesor'),
      'tipo', 'RENTA',
      'exclusividad', case lower(coalesce(d ->> 'f-tipo', ''))
                        when 'exclusiva' then 'EXCLUSIVA'
                        when 'opcion'    then 'OPCIÓN'
                        else null end,
      'precio', public.operatividad_numero(d ->> 'f-monto'),
      'fecha_contrato', v_fecha,
      'mes_recibo', public.operatividad_mes(v_fecha),
      'cliente_nombre', public.operatividad_texto(v_clientes ->> 0)
    ) || public.operatividad_partir_direccion(d ->> 'f-inmueble');

  elsif p_doc.tipo_documento = 'contrato_profeco' then
    -- El formato PROFECO es el de vivienda, así que la división siempre
    -- es residencial: el de comercial es otro contrato.
    --
    -- Aquí cada cliente es un objeto completo, y de ahí sale el teléfono
    -- del propietario. La alcaldía viene en su propio campo, así que se
    -- escribe encima de la que se haya adivinado partiendo la dirección.
    v_fecha := public.operatividad_fecha(d ->> 'f-con-fecha');
    v := jsonb_build_object(
      'asociado_nombre', public.operatividad_texto(d ->> 'f-agente'),
      'tipo', 'VENTA',
      'division', 'RESIDENCIAL',
      'exclusividad', case upper(coalesce(d ->> 'f-con-exclusividad', ''))
                        when 'SI' then 'EXCLUSIVA'
                        when 'NO' then 'OPCIÓN'
                        else null end,
      'precio', public.operatividad_numero(d ->> 'f-con-precio'),
      'porcentaje', public.operatividad_numero(d ->> 'f-con-contraprestacion'),
      'fecha_contrato', v_fecha,
      'mes_recibo', public.operatividad_mes(v_fecha),
      'cliente_nombre', public.operatividad_texto(v_clientes -> 0 ->> 'nombre'),
      'numero_propietario', public.operatividad_texto(v_clientes -> 0 ->> 'tel')
    )
    || public.operatividad_partir_direccion(d ->> 'f-inm-direccion')
    || jsonb_strip_nulls(jsonb_build_object(
         'alcaldia', public.operatividad_texto(d ->> 'f-inm-alcaldia')));

  else
    return null;
  end if;

  return jsonb_strip_nulls(
    v || jsonb_build_object('folio', public.operatividad_texto(p_doc.folio))
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 8) La sincronización
-- ─────────────────────────────────────────────────────────────
-- El trabajo de verdad va en una función normal y no directo en el
-- trigger porque hace falta poder llamarla a mano: el llenado inicial del
-- final de este archivo recorre los documentos que ya estaban finalizados
-- desde antes, y un trigger no se puede invocar.
--
-- Va como security definer porque quien finaliza el documento es el
-- asociado, y un asociado no tiene permiso de escribir en esta tabla (ni
-- debe tenerlo). Lo que escribe aquí no se lo inventa: sale de su propio
-- documento.
create or replace function public.operatividad_sincronizar_documento(p_doc public.documentos_guardados)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto jsonb;
  v_fila public.operatividad%rowtype;
  v_dic public.dictamenes%rowtype;
  v_perfil public.profiles%rowtype;
begin
  if p_doc.estado is distinct from 'finalizado' then return; end if;

  v_auto := public.operatividad_desde_documento(p_doc);
  if v_auto is null then return; end if;

  -- El nombre del asesor se escribe a mano en el documento y a veces se
  -- deja en blanco. El de la cuenta que lo generó sirve de respaldo.
  if not (v_auto ? 'asociado_nombre') then
    select * into v_perfil from public.profiles where id = p_doc.user_id;
    if found then
      v_auto := v_auto || jsonb_strip_nulls(jsonb_build_object(
        'asociado_nombre',
        public.operatividad_texto(trim(coalesce(v_perfil.nombre, '') || ' ' ||
                                       coalesce(v_perfil.apellido, '')))
      ));
    end if;
  end if;

  -- De aquí para abajo escribe la sincronización, no una persona: se
  -- levanta la bandera para que el trigger de operatividad_marcar_manual
  -- no confunda esto con una corrección. Se baja al final, para que una
  -- edición a mano hecha después en la misma transacción sí se marque.
  perform set_config('kw.operatividad_sync', 'si', true);

  select * into v_fila from public.operatividad where documento_id = p_doc.id;

  if not found then
    insert into public.operatividad (documento_id, asociado_id, sincronizado_at)
    values (p_doc.id, p_doc.user_id, now())
    returning * into v_fila;
  end if;

  -- Lo que una persona ya corrigió no se vuelve a tocar.
  v_auto := v_auto - v_fila.campos_manuales;

  -- El dictamen se busca mientras el renglón no tenga ninguno. Si alguien
  -- lo enlazó o lo desenlazó a mano, esa decisión manda sobre lo que la
  -- búsqueda opine.
  if v_fila.dictamen_id is null and not ('dictamen_id' = any(v_fila.campos_manuales)) then
    v_fila.dictamen_id := public.operatividad_buscar_dictamen(
      coalesce(v_auto ->> 'direccion', v_fila.direccion));
  end if;

  -- La fecha que vale es la que puso quien dictaminó (fecha_dictamen del
  -- dictamen), no la del reloj al guardarlo: a veces el expediente se
  -- captura días después de haberse revisado. Un dictamen todavía en
  -- borrador no aporta nada, y por eso se pide que ya tenga estatus.
  if v_fila.dictamen_id is not null then
    select * into v_dic from public.dictamenes where id = v_fila.dictamen_id;
    if found and public.operatividad_estatus_dictamen(v_dic.estado) is not null then
      v_auto := (v_auto || jsonb_strip_nulls(jsonb_build_object(
        'fecha_dictamen', v_dic.fecha_dictamen,
        'estatus_dictamen', public.operatividad_estatus_dictamen(v_dic.estado)
      ))) - v_fila.campos_manuales;
    end if;
  end if;

  -- jsonb_populate_record deja el renglón con los valores nuevos encima
  -- de los que ya tenía, columna por columna y sin tener que escribir un
  -- coalesce por cada una.
  v_fila := jsonb_populate_record(v_fila, v_auto);

  update public.operatividad set
    dictamen_id        = v_fila.dictamen_id,
    asociado_nombre    = v_fila.asociado_nombre,
    folio              = v_fila.folio,
    fecha_dictamen     = v_fila.fecha_dictamen,
    estatus_dictamen   = v_fila.estatus_dictamen,
    mes_recibo         = v_fila.mes_recibo,
    fecha_contrato     = v_fila.fecha_contrato,
    tipo               = v_fila.tipo,
    exclusividad       = v_fila.exclusividad,
    division           = v_fila.division,
    precio             = v_fila.precio,
    porcentaje         = v_fila.porcentaje,
    direccion          = v_fila.direccion,
    colonia            = v_fila.colonia,
    alcaldia           = v_fila.alcaldia,
    entidad            = v_fila.entidad,
    codigo_postal      = v_fila.codigo_postal,
    cliente_nombre     = v_fila.cliente_nombre,
    numero_propietario = v_fila.numero_propietario,
    sincronizado_at    = now()
  where id = v_fila.id;

  perform set_config('kw.operatividad_sync', '', true);
end;
$$;

create or replace function public.operatividad_al_guardar_documento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.operatividad_sincronizar_documento(new);
  return new;
end;
$$;

drop trigger if exists trg_operatividad_sincronizar on public.documentos_guardados;
create trigger trg_operatividad_sincronizar
  after insert or update on public.documentos_guardados
  for each row execute function public.operatividad_al_guardar_documento();

-- ─────────────────────────────────────────────────────────────
-- 9) Cuando el dictamen se mueve
-- ─────────────────────────────────────────────────────────────
-- Un expediente se dictamina días o semanas después de firmado el
-- contrato, y a veces cambia de estatus más de una vez. Sin esto, la
-- fecha y el estatus se quedarían como estaban el día que nació el
-- renglón, que es justo el dato que la hoja lleva vacío hoy.
create or replace function public.operatividad_al_dictaminar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.operatividad_estatus_dictamen(new.estado) is null then return new; end if;

  perform set_config('kw.operatividad_sync', 'si', true);

  update public.operatividad
  set fecha_dictamen = case when 'fecha_dictamen' = any(campos_manuales)
                            then fecha_dictamen else new.fecha_dictamen end,
      estatus_dictamen = case when 'estatus_dictamen' = any(campos_manuales)
                              then estatus_dictamen
                              else public.operatividad_estatus_dictamen(new.estado) end,
      sincronizado_at = now()
  where dictamen_id = new.id;

  perform set_config('kw.operatividad_sync', '', true);

  return new;
end;
$$;

drop trigger if exists trg_operatividad_al_dictaminar on public.dictamenes;
create trigger trg_operatividad_al_dictaminar
  after update on public.dictamenes
  for each row execute function public.operatividad_al_dictaminar();

-- ─────────────────────────────────────────────────────────────
-- 10) Deshacer las correcciones a mano de un renglón
-- ─────────────────────────────────────────────────────────────
-- Sin esto, marcar una columna a mano sería para siempre: los documentos
-- finalizados ya no se vuelven a guardar, así que la sincronización no
-- tendría cuándo volver a pasar por ese renglón.
--
-- Sirve para el caso de siempre: alguien corrigió la columna equivocada,
-- o el asesor arregló su documento y ahora el bueno es el de allá.
create or replace function public.operatividad_resincronizar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_documento uuid;
  v_doc public.documentos_guardados%rowtype;
begin
  if not public.is_staff_or_above() then
    raise exception 'No tienes permiso para tocar la operatividad';
  end if;

  select documento_id into v_documento from public.operatividad where id = p_id;
  if v_documento is null then
    raise exception 'Este renglón se capturó a mano, no hay documento del cual volver a tomarlo';
  end if;

  update public.operatividad
  set campos_manuales = '{}', sincronizado_at = now()
  where id = p_id;

  select * into v_doc from public.documentos_guardados where id = v_documento;
  if found then perform public.operatividad_sincronizar_documento(v_doc); end if;
end;
$$;

grant execute on function public.operatividad_resincronizar(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 11) Traer los acuerdos y contratos que ya estaban finalizados
-- ─────────────────────────────────────────────────────────────
-- El trigger solo alcanza lo que se guarde de aquí en adelante. Esto
-- recoge lo que ya se había finalizado antes de correr este archivo, para
-- que la hoja no empiece vacía.
--
-- Se puede volver a correr: los renglones que ya existen se reconocen por
-- documento_id y se ponen al día respetando lo corregido a mano, que es
-- exactamente lo que hace la sincronización de todos los días, porque es
-- la misma función.
do $$
declare
  v_doc public.documentos_guardados%rowtype;
begin
  for v_doc in
    select * from public.documentos_guardados
    where estado = 'finalizado'
      and tipo_documento in ('acuerdo_renta', 'contrato_profeco')
    order by finalizado_at
  loop
    perform public.operatividad_sincronizar_documento(v_doc);
  end loop;
end $$;
