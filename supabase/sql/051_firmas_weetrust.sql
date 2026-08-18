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

  -- De dónde salió el PDF. Son tres casos y no dos: además de los
  -- documentos hechos aquí (los formatos fijos de acuerdos/contratos y
  -- los del creador de plantillas), se puede subir un PDF de la
  -- computadora que no corresponde a nada de la plataforma.
  origen text not null check (origen in ('subido', 'guardado', 'plantilla')),

  documento_guardado_id uuid references public.documentos_guardados(id) on delete set null,
  documento_plantilla_id uuid references public.documentos_plantilla(id) on delete set null,

  -- Ruta del PDF original dentro del bucket 'firmas'. Siempre se llena,
  -- venga de donde venga: para los documentos de la plataforma es el PDF
  -- que se generó al momento de mandarlo, que hay que conservar porque
  -- es exactamente el que la gente firmó. Si después alguien edita la
  -- plantilla o se corrige el formato, lo firmado no cambia.
  archivo_ruta text not null,
  nombre_archivo text not null,

  -- Cada origen exige lo suyo: un documento de la plataforma tiene que
  -- apuntar a su fila, y uno subido no puede apuntar a ninguna. Sin este
  -- check se podría guardar un envío "de plantilla" huérfano, que en la
  -- pantalla saldría como un renglón sin nombre y sin manera de saber
  -- qué era.
  constraint firmas_documentos_origen_coherente check (
    case origen
      when 'subido' then documento_guardado_id is null and documento_plantilla_id is null
      when 'guardado' then documento_guardado_id is not null and documento_plantilla_id is null
      when 'plantilla' then documento_plantilla_id is not null and documento_guardado_id is null
    end
  ),

  -- Quién lo mandó a firmar. No se deduce del documento a propósito: el
  -- dueño del documento y quien pide la firma pueden ser distintos.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Título con el que se ve en la lista. Se captura al enviar, porque el
  -- nombre del archivo subido suele ser inservible ("scan_0012.pdf").
  titulo text not null,

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

-- La lista de "mis firmas", que es la pantalla principal.
create index if not exists idx_firmas_user
  on public.firmas_documentos(user_id, created_at desc);

-- Para pintar el estado de firma junto a cada documento en las listas
-- de Documentos y del Creador de formatos.
create index if not exists idx_firmas_doc_guardado
  on public.firmas_documentos(documento_guardado_id, created_at desc)
  where documento_guardado_id is not null;
create index if not exists idx_firmas_doc_plantilla
  on public.firmas_documentos(documento_plantilla_id, created_at desc)
  where documento_plantilla_id is not null;

-- El webhook llega con el documentID de weetrust y nada más: esa
-- búsqueda tiene que ser directa. Único porque su documentID identifica
-- un expediente y no se repite.
create unique index if not exists idx_firmas_weetrust_id
  on public.firmas_documentos(weetrust_document_id)
  where weetrust_document_id is not null;

alter table public.firmas_documentos enable row level security;

-- ── Permisos de la tabla ──
-- Leer: quien la mandó, el dueño del documento de origen, y el
-- liderazgo (que ya ve todos los documentos del equipo desde el Panel).
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

-- ── Bucket de los PDF ──
-- Privado, a diferencia de 'perfiles': aquí viven contratos con datos de
-- clientes, y una URL pública adivinable sería una fuga. Se leen con
-- URLs firmadas de duración corta, que Storage genera para quien ya pasó
-- las políticas de abajo.
--
-- Límite de 20 MB: un contrato escaneado con fotos llega a pesar, pero
-- más que eso casi siempre es un escaneo mal configurado, y weetrust
-- tampoco necesita esa resolución.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('firmas', 'firmas', false, 20971520, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Cada quien sube y lee dentro de su propia carpeta (firmas/<user_id>/).
-- El liderazgo lee todo, para poder auditar lo que se mandó a firmar.
drop policy if exists "firmas_storage_insert_own" on storage.objects;
create policy "firmas_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'firmas'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "firmas_storage_select_own" on storage.objects;
create policy "firmas_storage_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'firmas'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- Borrar sí, pero solo lo propio y solo mientras no se haya mandado:
-- el PDF que la gente ya firmó es la prueba de lo que firmaron, así que
-- no se puede quitar. Como Storage no sabe de la tabla de arriba, el
-- candado se pone consultándola.
drop policy if exists "firmas_storage_delete_own" on storage.objects;
create policy "firmas_storage_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'firmas'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1 from public.firmas_documentos f
      where f.archivo_ruta = storage.objects.name
        and f.estado in ('pendiente', 'completado')
    )
  );
