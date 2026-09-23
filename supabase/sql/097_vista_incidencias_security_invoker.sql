-- Fase 97: la vista de incidencias debe obedecer el RLS del solicitante.
--
-- Sus tablas base ya aplican la misma regla: la persona ve sus propias
-- incidencias y liderazgo ve todas. Conserva security_barrier, que limita
-- el empuje de predicados a través de esta frontera de la vista.

begin;

alter view public.incidencias_con_reportante
  set (security_invoker = true, security_barrier = true);

notify pgrst, 'reload schema';

commit;
