-- Validate at the database boundary, including service integrations.
-- Existing rows are not rewritten. Checks apply when the field changes.
begin;
create or replace function public.security_validate_fields()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  f record;
  v text;
begin
  for f in select key, value from jsonb_each(v_row) loop
    if tg_op = 'UPDATE' and f.value is not distinct from v_old -> f.key then continue; end if;
    if f.value = 'null'::jsonb then continue; end if;
    if jsonb_typeof(f.value) in ('object', 'array') and octet_length(f.value::text) > 8388608 then
      raise check_violation using message = 'El campo excede el limite permitido';
    end if;
    if jsonb_typeof(f.value) <> 'string' then continue; end if;
    v := f.value #>> '{}';
    if octet_length(v) > 2097152 then
      raise check_violation using message = 'El texto excede el limite permitido';
    end if;
    if f.key in ('email', 'correo') and v <> '' and
      (length(v) > 254 or v !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then
      raise check_violation using message = 'Correo invalido';
    end if;
    if f.key in ('nombre', 'apellido') and length(v) > 240 then
      raise check_violation using message = 'Nombre demasiado largo';
    end if;
    -- Plain text remains plain text. SQL is always parameterized and output
    -- is escaped by context; legitimate quotes and accents are preserved.
    if f.key in ('foto_url', 'portada_url', 'pdf_firmado_url') and v <> '' and
      (length(v) > 8192 or v !~ '^https://[^[:space:]<>"\\]+$') then
      raise check_violation using message = 'El enlace debe usar HTTPS';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.security_validate_fields() from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['profiles', 'prospectos', 'prospectos_reclutamiento', 'resenas',
    'documentos_guardados', 'documentos_plantilla', 'dictamenes', 'firmas_documentos', 'propiedades'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists security_validate_fields on public.%I', t);
      execute format('create trigger security_validate_fields before insert or update on public.%I for each row execute function public.security_validate_fields()', t);
    end if;
  end loop;
end $$;

-- Internal views already filter by ownership/role. Preserve those joins:
-- profiles intentionally does not expose every employee to every staff user.
-- Revoke anonymous/default grants. The key view had no WHERE, so use RLS there.
do $$ declare v record; begin
  for v in select viewname from pg_views where schemaname = 'public'
    and viewname not in ('perfiles_publicos', 'propiedades_publicas') loop
    execute format('alter view public.%I set (security_barrier = true)', v.viewname);
    execute format('revoke all on public.%I from public, anon', v.viewname);
  end loop;
end $$;
alter view public.api_llaves_visibles set (security_invoker = true);
revoke create on schema public from public, anon, authenticated;

-- Remove implicit anonymous execution of definer RPCs while preserving the
-- existing authenticated grants. Public form policy helpers are explicit.
do $$ declare f record; v_authenticated boolean; begin
  for f in select p.oid, p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    v_authenticated := has_function_privilege('authenticated', f.oid, 'EXECUTE');
    execute format('revoke execute on function %s from public, anon', f.signature);
    if v_authenticated then execute format('grant execute on function %s to authenticated', f.signature); end if;
  end loop;
end $$;
grant execute on function public.asesor_recibe_prospectos(uuid) to anon;
grant execute on function public.mfa_verificar_peticion() to anon;
-- Anonymous policies reference role helpers too (they return false for anon).
grant execute on function public.is_admin(), public.is_admin_or_master(), public.is_staff_or_above(), public.is_master() to anon;

-- A direct Auth password change must also revoke trusted devices. Enforcing
-- this only in frontend JavaScript leaves the direct Auth API unprotected.
create or replace function public.security_password_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    delete from public.mfa_sesiones where user_id = new.id;
    update public.mfa_dispositivos set revocado_en = now() where user_id = new.id and revocado_en is null;
    update public.mfa_correo_codigos set usado = true where user_id = new.id and not usado;
  end if;
  return new;
end;
$$;
revoke all on function public.security_password_changed() from public, anon, authenticated;
drop trigger if exists security_password_changed on auth.users;
create trigger security_password_changed after update of encrypted_password on auth.users
  for each row execute function public.security_password_changed();
notify pgrst, 'reload schema';
commit;
