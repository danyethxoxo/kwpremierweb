-- Fase 67: endurecer la seguridad antes de abrir el sitio a todo el
-- Market Center.
--
-- Son tres huecos que salieron de revisar el proyecto completo. Ninguno
-- se ha explotado (no hay señal de eso); se cierran porque con usuarios
-- reales y contratos de por medio ya no conviene dejarlos abiertos.
--
--   1. Un asociado podía darse a sí mismo el permiso de dictaminar.
--   2. Los contadores de folio estaban sin candado: cualquiera con
--      sesión podía moverlos y provocar folios repetidos.
--   3. El bucket de capturas de tickets aceptaba archivos de cualquier
--      tipo y de cualquier tamaño.
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor. Se puede volver
-- a correr sin problema y no toca datos ya capturados.


-- ═══════════════════════════════════════════════════════════════
-- 1) Nadie se puede autoasignar el permiso de dictaminar
-- ═══════════════════════════════════════════════════════════════
-- La política "update_own" de profiles deja que cada quien edite su
-- propio perfil (su foto, sus redes, su descripción). El rol ya estaba
-- protegido por este mismo trigger desde la fase 9, pero la columna
-- puede_dictaminar se agregó después (fase 61) y se quedó fuera: un
-- asociado podía mandar un update directo y quedar habilitado para
-- crear y editar dictámenes, que traen datos de clientes.
--
-- La vía legítima no se toca: set_puede_dictaminar() es SECURITY
-- DEFINER y ya comprueba que quien llama sea Master o Admin, así que
-- pasa el filtro de abajo sin cambios.

create or replace function public.proteger_rol_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- El rol solo lo mueve la Edge Function gestionar-usuario, que corre
  -- con la llave de servicio.
  if new.role is distinct from old.role and auth.role() <> 'service_role' then
    raise exception 'No tienes permiso para cambiar el rol de este perfil';
  end if;

  -- El permiso de dictaminar lo mueve Master o Admin (desde el panel,
  -- vía set_puede_dictaminar) o la llave de servicio. Nadie más, y
  -- menos sobre su propio perfil.
  if new.puede_dictaminar is distinct from old.puede_dictaminar
     and auth.role() <> 'service_role'
     and not public.is_admin_or_master() then
    raise exception 'No tienes permiso para cambiar el permiso de dictaminar';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proteger_rol on public.profiles;
create trigger trg_proteger_rol
  before update on public.profiles
  for each row execute function public.proteger_rol_perfil();


-- ═══════════════════════════════════════════════════════════════
-- 2) Candado a los contadores de folio
-- ═══════════════════════════════════════════════════════════════
-- Estas dos tablas viven en el esquema public, y en Supabase eso quiere
-- decir que la API REST las expone: sin RLS encendida, cualquiera con
-- sesión podía leerlas y, peor, moverles el número. Bastaba con eso
-- para que dos contratos distintos salieran con el mismo folio.
--
-- Se enciende RLS y se deja SIN políticas a propósito: nadie las toca
-- desde el navegador. Las funciones que reparten folio
-- (obtener_siguiente_folio y las de la fase 63) son SECURITY DEFINER y
-- corren como dueñas de la tabla, así que se saltan RLS y siguen
-- funcionando igual.

alter table public.folio_contadores enable row level security;

do $$
begin
  if to_regclass('public.folio_contadores_mes') is not null then
    execute 'alter table public.folio_contadores_mes enable row level security';
  end if;
end;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 3) Límites al bucket de capturas de tickets
-- ═══════════════════════════════════════════════════════════════
-- El bucket 'incidencias' se creó en la fase 10 sin tope de tamaño ni
-- lista de tipos permitidos. Con la política de subida que tiene,
-- cualquiera con sesión podía subir archivos de cualquier tipo y peso
-- dentro de su carpeta: se puede llenar el almacenamiento (que se
-- cobra) y se puede acabar sirviendo archivos raros desde un dominio
-- de la oficina.
--
-- Se deja en 5 MB y solo imágenes y PDF, que es lo que de verdad se
-- adjunta a un ticket. Lo ya subido no se toca.

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'
    ]
where id = 'incidencias';
