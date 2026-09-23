-- puede_dictaminar() es infraestructura de las politicas de dictamenes, no
-- un RPC para el cliente. La comprobacion privilegiada queda en private.
begin;

create or replace function private.puede_dictaminar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('master', 'admin', 'staff')
  );
$$;
revoke all on function private.puede_dictaminar() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.puede_dictaminar() to authenticated;

do $$
declare
  r record;
  v_qual text;
  v_check text;
begin
  for r in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and (
        coalesce(qual, '') like '%puede_dictaminar()%' or
        coalesce(with_check, '') like '%puede_dictaminar()%'
      )
  loop
    v_qual := regexp_replace(
      replace(r.qual, 'public.puede_dictaminar()', 'private.puede_dictaminar()'),
      '(^|[^.])puede_dictaminar[(][)]',
      E'\\1private.puede_dictaminar()',
      'g'
    );
    v_check := regexp_replace(
      replace(r.with_check, 'public.puede_dictaminar()', 'private.puede_dictaminar()'),
      '(^|[^.])puede_dictaminar[(][)]',
      E'\\1private.puede_dictaminar()',
      'g'
    );

    execute format(
      'drop policy %I on %I.%I',
      r.policyname, r.schemaname, r.tablename
    );
    execute format(
      'create policy %I on %I.%I as %s for %s to %s%s%s',
      r.policyname,
      r.schemaname,
      r.tablename,
      lower(r.permissive),
      lower(r.cmd),
      array_to_string(r.roles, ', '),
      case when r.qual is null then '' else format(' using (%s)', v_qual) end,
      case when r.with_check is null then '' else format(' with check (%s)', v_check) end
    );
  end loop;
end $$;

create or replace function public.puede_dictaminar()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.puede_dictaminar();
$$;
revoke all on function public.puede_dictaminar() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
