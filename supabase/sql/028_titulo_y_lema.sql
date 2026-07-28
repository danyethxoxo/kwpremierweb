-- Fase 25: el encabezado del perfil público también se edita.
--
-- El título grande ("Mi Perfil") y la línea de abajo ("Soy un profesional
-- inmobiliario") dejan de estar fijos en el HTML: cada quien los escribe
-- desde Mi Perfil. Quien no ponga nada sigue viendo los de siempre.
--
-- Requiere 026_micrositio_y_prospectos.sql.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

alter table public.profiles add column if not exists titulo_publico text;
alter table public.profiles add column if not exists lema_publico text;

-- La vista pública debe reflejar las columnas nuevas. Van al final: en un
-- `create or replace view` no se puede insertar una columna a la mitad.
create or replace view public.perfiles_publicos as
select id, nombre, apellido, role, foto_url, puesto,
       acerca_de, sitio_web, whatsapp, instagram, facebook, tiktok, linkedin,
       email, descripcion_corta,
       titulo_publico, lema_publico
from public.profiles
where oculto = false;

grant select on public.perfiles_publicos to anon, authenticated;
