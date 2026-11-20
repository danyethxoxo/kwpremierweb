create or replace function public.security_consume_rates(p_limits jsonb) returns jsonb language plpgsql security definer set search_path='' as $function$
declare item jsonb; outcome jsonb; allowed boolean:=true; retry integer:=1;
begin
 if pg_catalog.jsonb_typeof(p_limits)<>'array' or pg_catalog.jsonb_array_length(p_limits) not between 1 and 4 then raise exception 'Invalid rate limit batch'; end if;
 for item in select value from pg_catalog.jsonb_array_elements(p_limits) order by value->>'scope',value->>'subject' loop
  outcome:=public.security_consume_rate(item->>'scope',item->>'subject',(item->>'limit')::integer,coalesce((item->>'window')::integer,60));
  if not (outcome->>'allowed')::boolean then allowed:=false; retry:=greatest(retry,(outcome->>'retry_after')::integer); end if;
 end loop;
 return pg_catalog.jsonb_build_object('allowed',allowed,'retry_after',retry);
end $function$;
revoke all on function public.security_consume_rates(jsonb) from public,anon,authenticated;
grant execute on function public.security_consume_rates(jsonb) to service_role;
