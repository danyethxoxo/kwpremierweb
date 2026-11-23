-- Permiso completo de dictamenes, sin elevar el rol general de la cuenta.
alter table private.dictamen_lectores_globales add column if not exists puede_gestionar boolean not null default false;
update private.dictamen_lectores_globales l set puede_gestionar=true
from auth.users u where u.id=l.user_id and lower(btrim(u.email))='gabriela.landa@kwmexico.mx';

create or replace function private.puede_dictaminar() returns boolean
language sql stable security definer set search_path=''
as $fn$ select exists(select 1 from public.profiles p where p.id=(select auth.uid())
 and (p.role in('master','admin','staff') or exists(
 select 1 from private.dictamen_lectores_globales l where l.user_id=p.id and l.puede_gestionar))) $fn$;

create or replace function public.liderazgo_dictamina_siempre() returns trigger
language plpgsql security definer set search_path=''
as $fn$ begin
 new.puede_dictaminar := new.role in('master','admin','staff')
 or exists(select 1 from private.dictamen_lectores_globales l where l.user_id=new.id and l.puede_gestionar);
 return new;
end $fn$;
update public.profiles p set puede_dictaminar=true
from auth.users u where u.id=p.id and lower(btrim(u.email))='gabriela.landa@kwmexico.mx';
