-- Fase 24: GPS - Programa trimestral de seguimiento
--
-- Guarda los GPS que llena el liderazgo (el formato que antes vivía en
-- un Word suelto). A diferencia de acuerdos y contratos, aquí no hay
-- folios ni finalización: es un documento de trabajo que se va
-- actualizando durante el año.
--
-- Quién ve qué:
--   · Toda la sección de internos es de Liderazgo para arriba, así que
--     la tabla entera pide is_staff_or_above(). Un asociado no ve nada,
--     aunque llegue a la URL a mano.
--   · Dentro del liderazgo todos ven los GPS de todos: la idea es poder
--     consultar cómo va cada quien, no que cada uno guarde el suyo a
--     escondidas.
--   · Master/Admin pueden marcar uno como `oculto` para sacarlo de la
--     vista de los demás. Quien lo creó lo sigue viendo (si no, alguien
--     perdería su propio documento sin saber por qué).
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

create table if not exists public.gps_documentos (
  id uuid primary key default gen_random_uuid(),

  creado_por uuid not null references auth.users(id) on delete cascade,
  -- El nombre de quien lo creó se copia al guardar en vez de resolverse
  -- con un join: `profiles` solo deja verse a uno mismo (o a admin), así
  -- que desde el navegador la lista no podría poner los nombres de los
  -- demás. Además, como constancia, tiene sentido que quede el nombre
  -- que tenía en su momento.
  creado_por_nombre text,

  -- Datos de la cabecera del formato
  nombre text not null default '',
  puesto text,
  fecha_ingreso text,
  lider text,
  anio int,

  -- Las métricas son editables (se pueden renombrar, quitar o agregar),
  -- así que la lista viaja con cada documento en vez de estar fija en el
  -- código: dos GPS de años distintos pueden medir cosas distintas.
  metricas jsonb not null default '[]'::jsonb,
  -- Las celdas van como { "0-2-meta": "100", "0-2-logro": "80", ... }
  -- (fila-trimestre-campo). Guardar solo lo capturado sale más barato
  -- que una matriz completa llena de nulos.
  celdas jsonb not null default '{}'::jsonb,

  oculto boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint gps_nombre_largo check (char_length(nombre) <= 160),
  constraint gps_puesto_largo check (puesto is null or char_length(puesto) <= 120),
  constraint gps_lider_largo check (lider is null or char_length(lider) <= 160)
);

create index if not exists idx_gps_creado_por on public.gps_documentos(creado_por, updated_at desc);
create index if not exists idx_gps_actualizado on public.gps_documentos(updated_at desc);

drop trigger if exists trg_gps_updated_at on public.gps_documentos;
create trigger trg_gps_updated_at
  before update on public.gps_documentos
  for each row execute function public.set_updated_at();

alter table public.gps_documentos enable row level security;

-- Ver: Liderazgo para arriba. Los ocultos se le caen a los demás, pero
-- no a quien lo creó ni a Master/Admin.
drop policy if exists "select_liderazgo" on public.gps_documentos;
create policy "select_liderazgo" on public.gps_documentos
  for select using (
    public.is_staff_or_above()
    and (
      oculto = false
      or creado_por = auth.uid()
      or public.is_admin_or_master()
    )
  );

-- Crear: solo Liderazgo, y solo a nombre propio (no se puede sembrar un
-- GPS a nombre de alguien más).
drop policy if exists "insert_liderazgo" on public.gps_documentos;
create policy "insert_liderazgo" on public.gps_documentos
  for insert with check (
    public.is_staff_or_above() and creado_por = auth.uid()
  );

-- Editar: el suyo cada quien; Master/Admin cualquiera (son quienes
-- pueden ocultarlos).
drop policy if exists "update_propio_o_admin" on public.gps_documentos;
create policy "update_propio_o_admin" on public.gps_documentos
  for update using (
    creado_por = auth.uid() or public.is_admin_or_master()
  );

drop policy if exists "delete_propio_o_admin" on public.gps_documentos;
create policy "delete_propio_o_admin" on public.gps_documentos
  for delete using (
    creado_por = auth.uid() or public.is_admin_or_master()
  );
