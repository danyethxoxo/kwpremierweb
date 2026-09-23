-- Esta función solo la usan los triggers y otras funciones internas para
-- registrar la bitácora. No debe ser un RPC invocable por un usuario.
begin;

revoke execute on function public.dictamen_anotar(uuid, text, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
