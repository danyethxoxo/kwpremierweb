-- 122 recrea la vista y puede dejar sin las opciones de seguridad aplicadas
-- anteriormente. Reaplicarlas mantiene la vista sujeta al RLS de las tablas.
begin;

alter view public.dictamenes_con_asesor
  set (security_invoker = true, security_barrier = true);

revoke all on table public.dictamenes_con_asesor from anon;
grant select on table public.dictamenes_con_asesor to authenticated;

commit;

notify pgrst, 'reload schema';
