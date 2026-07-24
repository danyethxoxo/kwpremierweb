-- Fase 19: puesto de Staff — título específico que se muestra en la
-- tarjeta de cada persona en staff.html (ej. "Team Leader", "Technology
-- Director"), en vez de solo decir "Staff" para todos.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

alter table public.profiles add column if not exists puesto text;

alter table public.profiles drop constraint if exists profiles_puesto_check;
alter table public.profiles add constraint profiles_puesto_check
  check (puesto is null or puesto in (
    'Principal Operator',
    'Director of First Impressions',
    'Technology Director',
    'Productivity Coach',
    'Transaction Manager',
    'Market Center Administrator Assistant',
    'Market Center Administrator',
    'Team Leader'
  ));

-- La vista pública debe reflejar la columna nueva. Se agrega al final
-- del SELECT (no se puede insertar una columna a la mitad de una vista
-- ya creada).
create or replace view public.perfiles_publicos as
select id, nombre, apellido, role, foto_url, puesto
from public.profiles
where oculto = false;
