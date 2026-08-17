-- Firma electrónica con weetrust.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.
--
-- Guarda el enlace entre un documento de aquí y su expediente allá.
-- weetrust es la fuente de la verdad de la firma (ellos sellan el
-- documento completado en su blockchain); esta tabla es la copia local
-- para poder pintar el avance en el sitio sin salir a preguntarles en
-- cada carga de pantalla.
--
-- Un documento puede mandarse a firma más de una vez (se canceló, se
-- corrigió un correo, alguien nunca firmó y se rehízo), así que esto NO
-- es uno-a-uno: cada envío es su propia fila, y la vigente es la más
-- reciente que no esté cancelada.

create extension if not exists pgcrypto;

create table if not exists public.firmas_documentos (
  id uuid primary key default gen_random_uuid(),

  -- El documento de aquí. Son dos tablas distintas (los formatos fijos
  -- de acuerdos/contratos y los del creador de plantillas), así que van
  -- dos columnas y un check que obliga a que venga exactamente una. Es
  -- más aparatoso que una sola columna suelta, pero así la llave foránea
  -- existe de verdad: si el documento se borra, su firma se va con él.
  documento_guardado_id uuid references public.documentos_guardados(id) on delete cascade,
  documento_plantilla_id uuid references public.documentos_plantilla(id) on delete cascade,
  constraint firmas_documentos_un_solo_origen
    check (num_nonnulls(documento_guardado_id, documento_plantilla_id) = 1),

  -- Quién lo mandó a firmar. No se deduce del documento a propósito: el
  -- dueño del documento y quien pide la firma pueden ser distintos.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- El identificador del expediente en weetrust (su "documentID").
  -- Se llena hasta que ellos contestan; antes de eso la fila ya existe
  -- para poder registrar un error si la subida falla.
  weetrust_document_id text,

  -- Los mismos estados que maneja weetrust (DRAFT, PENDING, COMPLETED),
  -- más dos propios: 'preparando' es antes de que ellos respondan, y
  -- 'error' es cuando la subida no se logró. En minúsculas y en español
  -- para que se lean igual que el resto de la base.
  estado text not null default 'preparando'
    check (estado in ('preparando', 'borrador', 'pendiente', 'completado', 'cancelado', 'error')),

  -- Copia local de los firmantes. Cada uno:
  --   { nombre, correo, signatoryID, firmado (bool), firmado_at, url_firma }
  -- La url_firma es la liga personal que weetrust genera; caduca (ellos
  -- mandan un "expiry"), y se puede regenerar con su endpoint. Se guarda
  -- para poder reenviarla desde el sitio sin volver a crear el envío.
  firmantes jsonb not null default '[]'::jsonb,

  -- Dónde quedó el PDF ya firmado, cuando se completa.
  pdf_firmado_url text,

  -- Sandbox y producción son cuentas distintas con documentIDs que no se
  -- cruzan. Guardarlo evita el enredo de buscar en el ambiente que no es
  -- cuando se pruebe primero en sandbox y luego se cambie el interruptor.
  ambiente text not null default 'sandbox'
    check (ambiente in ('sandbox', 'produccion')),

  -- Qué contestó weetrust cuando algo salió mal, tal cual, para poder
  -- diagnosticar sin tener que reproducir el fallo.
  error_mensaje text,

  enviado_at timestamptz,
  completado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Para pintar el estado de firma junto a cada documento en las listas.
create index if not exists idx_firmas_doc_guardado
  on public.firmas_documentos(documento_guardado_id, created_at desc);
create index if not exists idx_firmas_doc_plantilla
  on public.firmas_documentos(documento_plantilla_id, created_at desc);

-- El webhook llega con el documentID de weetrust y nada más: esa
-- búsqueda tiene que ser directa. Único porque su documentID identifica
-- un expediente y no se repite.
create unique index if not exists idx_firmas_weetrust_id
  on public.firmas_documentos(weetrust_document_id)
  where weetrust_document_id is not null;

alter table public.firmas_documentos enable row level security;

-- ── Permisos ──
-- Leer: el que la pidió, el dueño del documento, y el liderazgo (que ya
-- ve todos los documentos del equipo desde el Panel).
drop policy if exists "firmas_select" on public.firmas_documentos;
create policy "firmas_select" on public.firmas_documentos
  for select using (
    auth.uid() = user_id
    or public.is_admin()
    or exists (
      select 1 from public.documentos_guardados d
      where d.id = documento_guardado_id and d.user_id = auth.uid()
    )
    or exists (
      select 1 from public.documentos_plantilla p
      where p.id = documento_plantilla_id and p.user_id = auth.uid()
    )
  );

-- Escribir: nadie desde el navegador. Estas filas las crea y las mueve
-- la Edge Function con la llave de servicio, que es la única que habla
-- con weetrust. Si el cliente pudiera escribir aquí, cualquiera podría
-- marcar un documento como "completado" sin que nadie lo firmara, y la
-- pantalla lo creería. No se declaran políticas de insert/update/delete
-- a propósito: sin política, con RLS prendido, la tabla queda cerrada.

drop trigger if exists set_firmas_updated_at on public.firmas_documentos;
create trigger set_firmas_updated_at
  before update on public.firmas_documentos
  for each row execute function public.set_updated_at();
