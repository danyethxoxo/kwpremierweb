-- Fase 96: RPC administrativas sin consumidor en la aplicación web.
--
-- Estas operaciones siguen teniendo su comprobación de rol como defensa en
-- profundidad, pero no hay interfaz ni trigger que las invoque. Se retiran
-- de la superficie REST/GraphQL para que no sean endpoints navegables.

begin;

revoke execute on function public.firmas_fijar_default(integer) from public, anon, authenticated;
revoke execute on function public.firmas_fijar_limite(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.set_puede_dictaminar(uuid, boolean) from public, anon, authenticated;

commit;
