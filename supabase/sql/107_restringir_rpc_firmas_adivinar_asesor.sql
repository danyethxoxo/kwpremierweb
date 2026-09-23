-- La adivinación del asesor se usa únicamente desde procesos de servidor
-- (firma de documentos y webhook). No debe exponerse como RPC a usuarios.
begin;

revoke execute on function public.firmas_adivinar_asesor(jsonb)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
