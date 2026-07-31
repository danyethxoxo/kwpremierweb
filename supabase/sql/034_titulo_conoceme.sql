-- Fase 30: el encabezado de "Conóceme" también se puede personalizar.
--
-- La pestaña ya se lee "Conóceme" en el micrositio, pero el título que
-- sale arriba del texto ("Acerca de mí") estaba fijo en el código. Se
-- vuelve un campo más, igual que titulo_publico y lema_publico
-- (028_titulo_y_lema.sql): sin llenarlo, se ve exactamente igual que
-- antes.
--
-- Requiere 028_titulo_y_lema.sql.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

alter table public.profiles
  add column if not exists titulo_conoceme text;

comment on column public.profiles.titulo_conoceme is
  'Encabezado de la sección "Conóceme" del micrositio. Vacío = "Acerca de mí".';

-- La vista pública nombra sus columnas una por una (ver 033), así que
-- hay que volver a crearla para que este campo se asome del otro lado.
create or replace view public.perfiles_publicos as
select id, nombre, apellido, role, foto_url, puesto,
       acerca_de, sitio_web, whatsapp, instagram, facebook, tiktok, linkedin,
       email, descripcion_corta,
       titulo_publico, lema_publico,
       portada_url,
       titulo_conoceme
from public.profiles
where oculto = false;

grant select on public.perfiles_publicos to anon, authenticated;
