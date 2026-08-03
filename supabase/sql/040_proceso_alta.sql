-- Fase 35: Proceso de Alta de nuevos asesores.
--
-- Deja constancia de a quién ya se le hizo el proceso y cómo le fue a
-- cada paso. Sirve para dos cosas: no volver a darlo de alta dos veces
-- (la pantalla marca los que ya se procesaron) y poder ver después qué
-- paso falló sin tener que adivinar.
--
-- Los datos de la persona se copian aquí a propósito: el Google Sheet
-- se edita a mano y una fila puede cambiar o desaparecer, y entonces el
-- registro de lo que se hizo se quedaría sin sentido.
--
-- Quién puede ver esto: solo los correos de la lista ALTA_EMAILS que se
-- configura en la Edge Function. Aquí en la base el candado es por rol
-- (master/admin), que es lo más fino que se puede sin repetir la lista
-- de correos en dos lados; el filtro por correo lo hace la función.
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

create table if not exists public.altas_procesadas (
  id uuid primary key default gen_random_uuid(),
  correo text not null,
  nombre text,
  telefono text,
  -- Qué se hizo y cómo salió. Cada paso guarda { ok, detalle }, así que
  -- si uno falló se puede ver cuál y por qué, y reintentar solo ese.
  pasos jsonb not null default '{}'::jsonb,
  -- Falso mientras algún paso haya fallado; sirve para pintar en la
  -- pantalla los que quedaron a medias.
  completo boolean not null default false,
  procesado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint altas_correo_largo check (char_length(correo) between 3 and 160)
);

-- Un mismo correo se puede reintentar (si falló un paso), pero conviene
-- poder buscarlo rápido.
create index if not exists idx_altas_correo on public.altas_procesadas(lower(correo));
create index if not exists idx_altas_created on public.altas_procesadas(created_at desc);

alter table public.altas_procesadas enable row level security;

-- Solo lectura desde el cliente, y solo para liderazgo. Quien escribe es
-- la Edge Function con la llave de servicio, que además comprueba que el
-- correo de quien la llama esté en ALTA_EMAILS.
drop policy if exists "select_liderazgo" on public.altas_procesadas;
create policy "select_liderazgo" on public.altas_procesadas
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('master', 'admin')
    )
  );
