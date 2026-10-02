create table if not exists public.propiedades_reportes (
  id bigint generated always as identity primary key,
  fuente text not null,
  corrida timestamptz not null,
  destinatario text not null,
  estado text not null default 'enviando'
    check (estado in ('enviando', 'enviado', 'error')),
  altas_nuevas integer not null default 0 check (altas_nuevas >= 0),
  reactivadas integer not null default 0 check (reactivadas >= 0),
  desactivadas integer not null default 0 check (desactivadas >= 0),
  mensaje_id text,
  error text,
  creado_at timestamptz not null default now(),
  enviado_at timestamptz,
  unique (fuente, corrida, destinatario)
);

alter table public.propiedades_reportes enable row level security;
revoke all on public.propiedades_reportes from public, anon, authenticated;
grant all on public.propiedades_reportes to service_role;
grant usage, select on sequence public.propiedades_reportes_id_seq to service_role;
create index if not exists propiedades_reportes_corrida
  on public.propiedades_reportes(fuente, corrida desc);
