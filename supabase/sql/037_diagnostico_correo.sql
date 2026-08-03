-- Diagnóstico: por qué no llegan los correos de notificación.
--
-- Esto NO cambia nada, solo consulta. Se corre completo en
-- Supabase Dashboard > SQL Editor y se revisa lo que devuelve cada
-- bloque: la primera línea que salga vacía o en falso es la que explica
-- dónde se rompe la cadena.
--
-- La cadena completa es:
--   pasa algo (ticket, usuario nuevo, prospecto)
--     -> un trigger mete una fila en `notificaciones`   [bloque 2 y 3]
--       -> trg_notificar_email llama a la Edge Function [bloque 1 y 4]
--         -> la función le pide a Resend que mande      [bloque 4]

-- ── 1) ¿Está puesto el disparador del correo? ────────────────────
-- Debe salir una fila con trg_notificar_email. Si sale vacío, falta
-- correr 036_notificar_email_trigger.sql.
select '1. disparador' as bloque, tgname as detalle
from pg_trigger
where tgrelid = 'public.notificaciones'::regclass
  and not tgisinternal;

-- ── 2) ¿Cuántos master/admin/staff hay, aparte de ti? ────────────
-- Un ticket avisa a master/admin/staff MENOS a quien lo reportó. Si
-- eres el único y tú lo reportaste, no se creó ninguna notificación y
-- por lo tanto no había correo que mandar: no está fallando nada.
select '2. quien recibe avisos de ticket' as bloque,
       role, count(*) as cuantos, count(email) as con_correo
from public.profiles
where role in ('master', 'admin', 'staff')
group by role;

-- ── 3) ¿Se guardaron notificaciones recientes? ───────────────────
-- Si esto sale vacío, el problema es de más arriba (no se generó el
-- aviso) y el correo nunca entró en juego.
select '3. notificaciones recientes' as bloque,
       n.created_at, n.tipo, n.titulo, p.email as iba_para
from public.notificaciones n
left join public.profiles p on p.id = n.user_id
order by n.created_at desc
limit 10;

-- ── 4) ¿Qué contestó la Edge Function? ───────────────────────────
-- Aquí se ve la respuesta real de cada llamada. Lo que dice `content`
-- es la pista principal:
--   {"ok":true,...}                    -> sí se mandó (revisar spam)
--   {"error":"No autorizado"}          -> el secreto del SQL no coincide
--                                         con WEBHOOK_SECRET de la función
--   {"aviso":"RESEND_API_KEY no..."}   -> falta ese secreto
--   {"aviso":"El destinatario no..."}  -> ese perfil no tiene email
--   {"error":"Resend rechazó..."}      -> lo dice Resend; casi siempre es
--                                         que la dirección de prueba de
--                                         Resend solo puede escribirle al
--                                         correo con el que abriste tu
--                                         cuenta ahí, hasta verificar un
--                                         dominio propio
-- Si sale vacío, el disparador no llegó a llamar a la función.
select '4. respuesta de la funcion' as bloque,
       created, status_code, content
from net._http_response
order by created desc
limit 10;
