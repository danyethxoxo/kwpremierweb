-- Run after 087. Phase one: deploy gateway before activating 089.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.security_rate_limits (
  scope text not null,
  subject_hash text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (scope, subject_hash)
);
alter table private.security_rate_limits enable row level security;
revoke all on private.security_rate_limits from public, anon, authenticated;
create index if not exists security_rate_expiry on private.security_rate_limits(window_start);

create table if not exists private.security_config (
  id boolean primary key default true check (id),
  gateway_secret text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
alter table private.security_config enable row level security;
revoke all on private.security_config from public, anon, authenticated;
insert into private.security_config (id) values (true) on conflict do nothing;

-- Atomic across Edge isolates. The caller cannot choose its own budget because
-- only service_role can invoke this RPC. HMAC avoids storing IPs in plain text.
create or replace function public.security_consume_rate(
  p_scope text, p_subject text, p_limit integer, p_window integer default 60
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_start timestamptz;
  v_hits integer;
  v_hash text;
begin
  if p_limit not between 1 and 10000 or p_window not between 1 and 3600
     or length(p_scope) not between 1 and 100 or length(p_subject) not between 1 and 200 then
    raise exception 'Invalid rate limit parameters';
  end if;
  select encode(extensions.hmac(p_subject, gateway_secret, 'sha256'), 'hex') into v_hash
    from private.security_config where id;
  insert into private.security_rate_limits as r (scope, subject_hash, window_start, hits)
    values (p_scope, v_hash, v_now, 1)
  on conflict (scope, subject_hash) do update set
    window_start = case when r.window_start + make_interval(secs => p_window) <= v_now then v_now else r.window_start end,
    hits = case when r.window_start + make_interval(secs => p_window) <= v_now then 1 else least(r.hits + 1, p_limit + 1) end
  returning hits, window_start into v_hits, v_start;
  return jsonb_build_object('allowed', v_hits <= p_limit,
    'retry_after', greatest(1, ceil(extract(epoch from v_start + make_interval(secs => p_window) - v_now))::int));
end;
$$;
revoke all on function public.security_consume_rate(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.security_consume_rate(text, text, integer, integer) to service_role;

create or replace function public.security_prune_rates()
returns void language sql security definer set search_path = '' as $$
  delete from private.security_rate_limits where window_start < now() - interval '2 hours';
$$;
revoke all on function public.security_prune_rates() from public, anon, authenticated;
grant execute on function public.security_prune_rates() to service_role;
-- Supabase cron (when enabled). Otherwise schedule this RPC externally hourly.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('kw-security-rate-cleanup', '17 * * * *', 'select public.security_prune_rates()');
  end if;
end $$;
commit;
