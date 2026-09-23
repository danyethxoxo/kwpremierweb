-- Fase 95: las funciones auxiliares de sincronización y folios no son RPC.
--
-- Se conservan las llamadas desde funciones SECURITY DEFINER y triggers, que
-- se ejecutan como el propietario. Se impide únicamente su invocación directa
-- desde los roles que atienden solicitudes del navegador.

begin;

revoke execute on function public.dictamen_asesor_reflejar(text, text, boolean) from public, anon, authenticated;
revoke execute on function public.dictamen_asesores_reconciliar() from public, anon, authenticated;
revoke execute on function public.folio_del_mes(text) from public, anon, authenticated;
revoke execute on function public.obtener_siguiente_folio(text) from public, anon, authenticated;
revoke execute on function public.operatividad_sincronizar_documento(public.documentos_guardados) from public, anon, authenticated;

commit;
