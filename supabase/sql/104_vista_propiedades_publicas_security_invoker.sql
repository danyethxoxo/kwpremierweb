-- La vista pública sigue disponible para el sitio, pero las filas y
-- columnas ahora quedan sujetas al RLS de public.propiedades.
begin;

alter view public.propiedades_publicas
  set (security_invoker = true, security_barrier = true);

revoke all on public.propiedades_publicas from public;
grant select on public.propiedades_publicas to anon, authenticated;

notify pgrst, 'reload schema';
commit;
