-- Que el historial se mantenga solo.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.
--
-- Hasta ahora el historial solo se llenaba con lo que se manda desde el
-- sitio, y lo que alguien mandaba desde el panel de weetrust aparecía
-- únicamente si el liderazgo corría la importación a mano.
--
-- Pero weetrust ya nos avisa de esos documentos: el webhook de
-- 'sendDocument' llega igual, venga de donde venga el envío. Lo que
-- faltaba era dejar que el aviso cree el renglón cuando todavía no
-- existe, en vez de descartarlo. Esta migración quita los dos estorbos
-- que lo impedían.

-- 1) Un documento mandado desde el panel de weetrust puede ser de
--    alguien que ni siquiera tiene cuenta en el sitio. La columna deja
--    de ser obligatoria para poder guardarlo de todas formas.
--
--    Ojo con el efecto en los permisos, que es el correcto: la política
--    de lectura compara auth.uid() con user_id, y una comparación contra
--    null nunca es cierta. O sea que un documento sin dueño solo lo ve el
--    liderazgo, que es justo lo que se quiere: nadie debería encontrarse
--    en "sus" firmas un contrato que no mandó.
alter table public.firmas_documentos
  alter column user_id drop not null;

-- 2) Lo mismo para el nombre del archivo: del aviso no siempre viene, y
--    un renglón sin nombre es preferible a perder el documento entero.
alter table public.firmas_documentos
  alter column nombre_archivo drop not null;

-- 3) Realtime, para que la tabla del sitio se refresque sola cuando algo
--    cambia, sin que nadie recargue la página.
--
--    Va dentro de un bloque porque agregar dos veces la misma tabla a la
--    publicación truena, y estas migraciones tienen que poder volver a
--    correrse sin romper nada.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'firmas_documentos'
  ) then
    alter publication supabase_realtime add table public.firmas_documentos;
  end if;
end $$;

-- Realtime respeta las mismas políticas de lectura de arriba, así que
-- por aquí no se filtra nada: a cada quien le llegan los cambios de los
-- renglones que ya podía ver.
alter table public.firmas_documentos replica identity full;
