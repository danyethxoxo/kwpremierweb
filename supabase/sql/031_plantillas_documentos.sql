-- Fase 28: creador de documentos sin tocar código.
--
-- Hasta ahora, agregar un formato significaba escribir un archivo HTML de
-- ~1,700 líneas. Con esto, el staff arma la hoja desde el portal: se
-- eligen bloques (título, texto, campos, tablas, casillas, firmas) y de
-- ahí sale tanto el formulario que llena el asesor como la hoja impresa.
--
-- La hoja siempre trae el logo de KW Premier arriba y sus márgenes; eso
-- no se configura, para que todos los documentos salgan parejos.
--
-- ─────────────────────────────────────────────────────────────
-- CÓMO SE GUARDA UNA PLANTILLA
-- ─────────────────────────────────────────────────────────────
-- `bloques` es un arreglo en orden, y cada bloque trae su tipo:
--
--   { "tipo": "titulo",  "texto": "CONTRATO DE ARRENDAMIENTO",
--     "alineacion": "centro" }                       -- o "izquierda"
--   { "tipo": "texto",   "texto": "En la Ciudad de México, a {{fecha}}…" }
--   { "tipo": "campo",   "clave": "cliente", "etiqueta": "Nombre del cliente",
--     "formato": "texto", "ancho": "completo" }      -- texto|numero|moneda|fecha|parrafo
--   { "tipo": "tabla",   "columnas": ["Concepto","Monto"],
--     "filas": [["Renta mensual","{{renta}}"]] }
--   { "tipo": "casilla", "clave": "acepta", "etiqueta": "Acepta el aviso de privacidad" }
--   { "tipo": "firma",   "etiqueta": "Nombre y firma del arrendatario" }
--   { "tipo": "salto" }                              -- corta la hoja aquí
--
-- Dentro de "texto" y de las celdas de una tabla se puede escribir
-- {{clave}} para insertar lo que el asesor capturó en ese campo.
--
-- Requiere 001_profiles.sql y 005_roles_jerarquia.sql.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

create table if not exists public.plantillas_documento (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  categoria text not null default 'acuerdos'
    check (categoria in ('acuerdos', 'contratos', 'internos')),
  bloques jsonb not null default '[]'::jsonb,
  publicada boolean not null default false,
  creada_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint plantillas_nombre_largo check (char_length(nombre) between 3 and 120),
  -- Los bloques siempre son una lista, aunque venga vacía
  constraint plantillas_bloques_lista check (jsonb_typeof(bloques) = 'array')
);

create index if not exists idx_plantillas_categoria
  on public.plantillas_documento(categoria, nombre);

alter table public.plantillas_documento enable row level security;

-- Las publicadas las ve cualquiera con sesión (son los formatos que va a
-- llenar el asesor). Los borradores solo quien puede editarlos.
drop policy if exists "select_publicadas" on public.plantillas_documento;
create policy "select_publicadas" on public.plantillas_documento
  for select to authenticated
  using (publicada = true or public.is_staff_or_above());

-- Crear y modificar formatos es cosa de Liderazgo para arriba: un formato
-- mal armado lo usa toda la oficina.
drop policy if exists "insert_staff" on public.plantillas_documento;
create policy "insert_staff" on public.plantillas_documento
  for insert to authenticated with check (public.is_staff_or_above());

drop policy if exists "update_staff" on public.plantillas_documento;
create policy "update_staff" on public.plantillas_documento
  for update to authenticated using (public.is_staff_or_above());

drop policy if exists "delete_staff" on public.plantillas_documento;
create policy "delete_staff" on public.plantillas_documento
  for delete to authenticated using (public.is_staff_or_above());

-- ─────────────────────────────────────────────────────────────
-- Documentos llenados a partir de una plantilla
-- ─────────────────────────────────────────────────────────────
-- Se guarda copia de los bloques tal como estaban al finalizar. Si
-- después alguien edita la plantilla, lo ya firmado no cambia - que es
-- lo mínimo que se le pide a un documento con folio.
create table if not exists public.documentos_plantilla (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid references public.plantillas_documento(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null,
  valores jsonb not null default '{}'::jsonb,
  bloques_congelados jsonb,
  estado text not null default 'borrador' check (estado in ('borrador', 'finalizado')),
  folio text,
  finalizado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_documentos_plantilla_user
  on public.documentos_plantilla(user_id, updated_at desc);

alter table public.documentos_plantilla enable row level security;

drop policy if exists "select_propios" on public.documentos_plantilla;
create policy "select_propios" on public.documentos_plantilla
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin_or_master());

drop policy if exists "insert_propios" on public.documentos_plantilla;
create policy "insert_propios" on public.documentos_plantilla
  for insert to authenticated with check (auth.uid() = user_id);

-- Un documento finalizado ya no se toca: para eso está finalizarlo.
drop policy if exists "update_propios" on public.documentos_plantilla;
create policy "update_propios" on public.documentos_plantilla
  for update to authenticated
  using (auth.uid() = user_id and estado = 'borrador');

drop policy if exists "delete_propios" on public.documentos_plantilla;
create policy "delete_propios" on public.documentos_plantilla
  for delete to authenticated
  using (auth.uid() = user_id and estado = 'borrador');

-- ─────────────────────────────────────────────────────────────
-- Finalizar: congela los bloques y pone folio
-- ─────────────────────────────────────────────────────────────
create or replace function public.finalizar_documento_plantilla(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_doc public.documentos_plantilla%rowtype;
  v_bloques jsonb;
  v_folio text;
begin
  select * into v_doc from public.documentos_plantilla where id = p_id;
  if not found then raise exception 'Documento no encontrado'; end if;
  if v_doc.user_id <> auth.uid() then raise exception 'No es tu documento'; end if;
  if v_doc.estado = 'finalizado' then return v_doc.folio; end if;

  select bloques into v_bloques from public.plantillas_documento where id = v_doc.plantilla_id;

  -- Folio: KWP-AÑO-consecutivo del año
  select 'KWP-' || to_char(now(), 'YYYY') || '-' ||
         lpad((count(*) + 1)::text, 4, '0')
  into v_folio
  from public.documentos_plantilla
  where estado = 'finalizado'
    and date_part('year', finalizado_at) = date_part('year', now());

  update public.documentos_plantilla
  set estado = 'finalizado',
      folio = v_folio,
      bloques_congelados = coalesce(v_bloques, bloques_congelados),
      finalizado_at = now(),
      updated_at = now()
  where id = p_id;

  return v_folio;
end;
$$;

grant execute on function public.finalizar_documento_plantilla(uuid) to authenticated;
