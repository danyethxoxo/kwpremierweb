-- Fase 20: perfil público extendido — cada quien puede llenar desde
-- Mi Perfil su "Acerca de mí", sitio web, WhatsApp y redes sociales,
-- y esa info se muestra en su tarjeta de Asesores/Staff.
--
-- Nota: cuando se construya la integración con Command (pendiente),
-- estos mismos campos podrán sincronizarse desde allá si su API trae
-- info de agentes — por eso viven como columnas normales de profiles.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

alter table public.profiles add column if not exists acerca_de text;
alter table public.profiles add column if not exists sitio_web text;
alter table public.profiles add column if not exists whatsapp text;
alter table public.profiles add column if not exists instagram text;
alter table public.profiles add column if not exists facebook text;
alter table public.profiles add column if not exists tiktok text;
alter table public.profiles add column if not exists linkedin text;

-- La vista pública debe reflejar las columnas nuevas. Se agregan al
-- final del SELECT (no se puede insertar una columna a la mitad de una
-- vista ya creada).
create or replace view public.perfiles_publicos as
select id, nombre, apellido, role, foto_url, puesto,
       acerca_de, sitio_web, whatsapp, instagram, facebook, tiktok, linkedin
from public.profiles
where oculto = false;
