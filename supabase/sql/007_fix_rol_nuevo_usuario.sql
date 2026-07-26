-- Fix: el trigger que crea el perfil de cada usuario nuevo seguía
-- insertando el rol 'user', que ya no es válido desde la Fase 5
-- (ahora solo se aceptan 'master', 'admin', 'staff', 'asociado').
-- Esto hacía que Supabase rechazara la creación de CUALQUIER usuario
-- nuevo (por invitación o registro). Ejecutar en SQL Editor.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nombre, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    'asociado'
  );
  return new;
end;
$$;
