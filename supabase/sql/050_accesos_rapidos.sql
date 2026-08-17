-- Fase 50: accesos rápidos de cada quien.
--
-- La barra lateral derecha del sitio: cada persona guarda ahí los
-- lugares a los que entra seguido (una carpeta de Drive, un acuerdo,
-- su perfil, lo que sea) y los tiene a un deslizón de distancia.
--
-- Es una lista PERSONAL: nadie ve ni toca la de otro. Eso lo sostienen
-- las políticas de abajo, no el código del sitio.
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor.
-- Se puede volver a correr sin romper nada.

create table if not exists public.accesos_rapidos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  titulo     text not null,
  url        text not null,
  -- Clave del dibujito (doc, carpeta, calendario…), no el SVG: el
  -- dibujo vive en el código, donde se puede versionar.
  icono      text not null default 'doc',
  orden      smallint not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.accesos_rapidos is
  'Accesos que cada quien se guarda para la barra lateral derecha. Lista personal: las políticas RLS impiden ver o tocar la de alguien más.';

-- Buscar siempre es "los míos, en orden", así que el índice va por ahí.
create index if not exists accesos_rapidos_user_orden_idx
  on public.accesos_rapidos (user_id, orden, created_at);

-- La misma página no se guarda dos veces.
create unique index if not exists accesos_rapidos_user_url_idx
  on public.accesos_rapidos (user_id, url);

alter table public.accesos_rapidos enable row level security;

-- Una política por operación, todas contra el mismo dueño. Se borran
-- antes de crearlas para que este archivo se pueda volver a correr.
drop policy if exists "accesos_rapidos_ver_los_mios"      on public.accesos_rapidos;
drop policy if exists "accesos_rapidos_crear_los_mios"    on public.accesos_rapidos;
drop policy if exists "accesos_rapidos_editar_los_mios"   on public.accesos_rapidos;
drop policy if exists "accesos_rapidos_borrar_los_mios"   on public.accesos_rapidos;

create policy "accesos_rapidos_ver_los_mios"
  on public.accesos_rapidos for select
  using (auth.uid() = user_id);

create policy "accesos_rapidos_crear_los_mios"
  on public.accesos_rapidos for insert
  with check (auth.uid() = user_id);

create policy "accesos_rapidos_editar_los_mios"
  on public.accesos_rapidos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "accesos_rapidos_borrar_los_mios"
  on public.accesos_rapidos for delete
  using (auth.uid() = user_id);
