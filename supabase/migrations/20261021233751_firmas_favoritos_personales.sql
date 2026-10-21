create table if not exists public.firmas_favoritos_personales (
  user_id uuid not null references auth.users(id) on delete cascade,
  correo text not null check (correo = lower(trim(correo)) and correo ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(correo) <= 254),
  nombre text not null check (length(trim(nombre)) between 1 and 160),
  created_at timestamptz not null default now(),
  primary key (user_id, correo)
);
alter table public.firmas_favoritos_personales enable row level security;
revoke all on public.firmas_favoritos_personales from anon, public, authenticated;
grant select, insert, update, delete on public.firmas_favoritos_personales to authenticated;
grant all on public.firmas_favoritos_personales to service_role;
drop policy if exists favoritos_propios on public.firmas_favoritos_personales;
create policy favoritos_propios on public.firmas_favoritos_personales for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
