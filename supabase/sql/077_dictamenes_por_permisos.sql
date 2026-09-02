-- ═════════════════════════════════════════════════════════════
-- 077 · Dictámenes por permisos del usuario
-- ═════════════════════════════════════════════════════════════
-- Master, Admin y Liderazgo pueden dictaminar. Asociado no puede.
-- El permiso deja de administrarse persona por persona desde el Panel.

update public.profiles
set puede_dictaminar = (role in ('master', 'admin', 'staff'));

create or replace function public.puede_dictaminar()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('master', 'admin', 'staff')
  );
$$;

create or replace function public.liderazgo_dictamina_siempre()
returns trigger
language plpgsql set search_path = public
as $$
begin
  new.puede_dictaminar := new.role in ('master', 'admin', 'staff');
  return new;
end;
$$;

drop trigger if exists trg_liderazgo_dictamina_siempre on public.profiles;
create trigger trg_liderazgo_dictamina_siempre
  before insert or update of role, puede_dictaminar on public.profiles
  for each row execute function public.liderazgo_dictamina_siempre();
