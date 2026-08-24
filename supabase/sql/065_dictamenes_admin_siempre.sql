-- Fase 65: Admin dictamina siempre, igual que Master
--
-- Hasta ahora Admin tenía que prenderse la casilla "Dictámenes" persona
-- por persona desde el Panel (061_dictamenes.sql dejaba esa palanca
-- para el equipo legal, que puede ser de Liderazgo o de Admin, pero no
-- todo Admin dictamina). Ahora se pide lo contrario: TODO Admin
-- dictamina, sin tener que acordarse de prenderle la casilla a cada
-- quien - ni a los que ya existen, ni a los que se den de alta después.
--
-- El patrón es el mismo que ya existía para Master: se prende la
-- casilla de quien ya es Admin, y un disparador la vuelve a prender
-- sola en cuanto alguien LLEGUE a ser Admin, para que la base nunca
-- diga "no puede" de alguien a quien el sistema sí deja pasar.
--
-- Requiere 061_dictamenes.sql.
-- Ejecutar completo en Supabase Dashboard > SQL Editor. Se puede volver
-- a correr sin problema: no pisa el permiso de quien ya lo tenía
-- prendido por su cuenta (una Liderazgo con el permiso a mano, por
-- ejemplo), nada más añade a Admin al grupo que siempre puede.

update public.profiles set puede_dictaminar = true
where role = 'admin' and puede_dictaminar = false;

create or replace function public.puede_dictaminar()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (puede_dictaminar = true or role in ('master', 'admin'))
  );
$$;

-- Sustituye al disparador de 061_dictamenes.sql (que solo cubría
-- Master): mismo mecanismo, ahora para los dos roles que siempre
-- dictaminan.
create or replace function public.liderazgo_dictamina_siempre()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.role in ('master', 'admin') then new.puede_dictaminar := true; end if;
  return new;
end;
$$;

drop trigger if exists trg_master_siempre_dictamina on public.profiles;
drop function if exists public.master_siempre_dictamina();

drop trigger if exists trg_liderazgo_dictamina_siempre on public.profiles;
create trigger trg_liderazgo_dictamina_siempre
  before insert or update of role, puede_dictaminar on public.profiles
  for each row execute function public.liderazgo_dictamina_siempre();
