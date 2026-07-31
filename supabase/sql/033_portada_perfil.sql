-- Fase 29: foto de portada del perfil público.
--
-- El micrositio pasa a verse como una red social: una imagen ancha
-- arriba y la foto del asesor encimada. La portada es opcional; sin
-- ella se pinta un degradado en rojo KW, que es lo que se veía antes.
--
-- La imagen vive en el mismo bucket `perfiles` que la foto de perfil
-- (ver 019_micrositio.sql / la política de storage que ya existe), en
-- la ruta <user_id>/portada.jpg. Aquí solo se guarda su dirección.
--
-- Requiere 001_profiles.sql.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

alter table public.profiles
  add column if not exists portada_url text;

comment on column public.profiles.portada_url is
  'Imagen ancha del encabezado del micrositio. Nula = degradado por defecto.';

-- La vista pública nombra sus columnas una por una, así que agregar la
-- columna a la tabla no basta: hay que volver a crearla o la portada no
-- se asoma del otro lado. Se repiten todas las de 028_titulo_y_lema.sql
-- más la nueva, al final (create or replace no deja meterla a la mitad).
create or replace view public.perfiles_publicos as
select id, nombre, apellido, role, foto_url, puesto,
       acerca_de, sitio_web, whatsapp, instagram, facebook, tiktok, linkedin,
       email, descripcion_corta,
       titulo_publico, lema_publico,
       portada_url
from public.profiles
where oculto = false;

grant select on public.perfiles_publicos to anon, authenticated;
