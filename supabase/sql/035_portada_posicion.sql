-- Fase 31: qué parte de la portada se ve.
--
-- La portada se recorta distinto en celular y en escritorio (son de
-- alturas distintas), así que no basta con centrarla siempre: a veces
-- lo importante de la foto queda arriba o abajo del recorte. Se guarda
-- en qué punto vertical de la foto hay que "anclarla" (0 = se ve la
-- parte de arriba, 100 = la de abajo, 50 = como estaba antes), y el
-- editor de perfil deja ajustarlo viendo ambas vistas a la vez.
--
-- Requiere 033_portada_perfil.sql.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

alter table public.profiles
  add column if not exists portada_pos_y smallint not null default 50;

comment on column public.profiles.portada_pos_y is
  'Punto de anclaje vertical de la portada (0-100, centro por defecto). Se usa como background-position.';

-- La vista pública nombra sus columnas una por una (ver 033), así que
-- hay que volver a crearla para que este campo se asome del otro lado.
-- Ojo: create or replace view solo deja agregar columnas al final, no
-- en medio - por eso portada_pos_y va después de titulo_conoceme y no
-- junto a portada_url, aunque estén relacionadas.
create or replace view public.perfiles_publicos as
select id, nombre, apellido, role, foto_url, puesto,
       acerca_de, sitio_web, whatsapp, instagram, facebook, tiktok, linkedin,
       email, descripcion_corta,
       titulo_publico, lema_publico,
       portada_url,
       titulo_conoceme,
       portada_pos_y
from public.profiles
where oculto = false;

grant select on public.perfiles_publicos to anon, authenticated;
