-- Prueba transaccional con identidades existentes. No envia avisos ni persiste cambios.
begin;
create temp table permiso_casos(label text,uid uuid,todos boolean,sid uuid default gen_random_uuid());
insert into permiso_casos(label,uid,todos)
select 'asesor_'||row_number() over(),id,false from (
 select p.id from public.profiles p join auth.users u on u.id=p.id
 where p.role='asociado' and u.email_confirmed_at is not null
 and lower(u.email)<>'gabriela.landa@kwmexico.mx'
 and exists(select 1 from public.dictamenes d join public.dictamen_asesores a on a.id=d.asesor_id where lower(btrim(a.correo))=lower(btrim(u.email)))
 order by p.id limit 2
) s;
insert into permiso_casos(label,uid,todos)
select 'sin_dictamen',p.id,false from public.profiles p join auth.users u on u.id=p.id
where p.role='asociado' and u.email_confirmed_at is not null and lower(u.email)<>'gabriela.landa@kwmexico.mx'
and not exists(select 1 from public.dictamenes d join public.dictamen_asesores a on a.id=d.asesor_id where lower(btrim(a.correo))=lower(btrim(u.email))) limit 1;
insert into permiso_casos(label,uid,todos)
select 'gabriela',id,true from auth.users where lower(email)='gabriela.landa@kwmexico.mx';
insert into permiso_casos(label,uid,todos)
select distinct on(role) role,id,true from public.profiles where role in('master','admin','staff') order by role,id;
create temp table permiso_esperado as select c.label,d.id from permiso_casos c cross join public.dictamenes d
where c.todos or exists(select 1 from public.dictamen_asesores a join auth.users u on lower(btrim(a.correo))=lower(btrim(u.email)) where u.id=c.uid and a.id=d.asesor_id);
create temp table permiso_detalle as
select e.label,'dictamen_clientes' tabla,count(*) n from permiso_esperado e join public.dictamen_clientes h on h.dictamen_id=e.id group by e.label
union all select e.label,'dictamen_puntos',count(*) from permiso_esperado e join public.dictamen_puntos h on h.dictamen_id=e.id group by e.label
union all select e.label,'dictamen_historial',count(*) from permiso_esperado e join public.dictamen_historial h on h.dictamen_id=e.id group by e.label
union all select e.label,'dictamen_revisiones',count(*) from permiso_esperado e join public.dictamen_revisiones h on h.dictamen_id=e.id group by e.label;
create temp table permiso_resultado(label text,visibles bigint,detalle boolean,mfa_bloqueado boolean);
grant select on permiso_casos,permiso_esperado,permiso_detalle to authenticated;
grant insert on permiso_resultado to authenticated;
-- Evita el trigger de notificaciones solo al preparar las filas temporales MFA.
set local session_replication_role=replica;
insert into public.mfa_metodos(user_id,activo) select uid,true from permiso_casos
on conflict(user_id) do update set activo=true;
insert into public.mfa_sesiones(session_id,user_id,verificado_hasta)
select sid,uid,now()+interval '10 minutes' from permiso_casos;
set local session_replication_role=origin;
do $test$
declare c record;t text;n bigint;esperado bigint;v bigint;filas bigint;nuevo uuid;
begin
 if (select count(*) from permiso_casos)<>7 then raise exception 'Faltan identidades para la matriz'; end if;
 for c in select * from permiso_casos loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c.uid,'role','authenticated','session_id',c.sid,'email','correo-ajeno@example.invalid')::text,true);
  execute 'set local role authenticated';
  perform set_config('request.path','/dictamenes_con_asesor',true);
  if exists((select id from public.dictamenes except select id from permiso_esperado where label=c.label)
      union all (select id from permiso_esperado where label=c.label except select id from public.dictamenes))
   then raise exception 'Aislamiento de tabla fallido: %',c.label; end if;
  if exists((select id from public.dictamenes_con_asesor except select id from permiso_esperado where label=c.label)
      union all (select id from permiso_esperado where label=c.label except select id from public.dictamenes_con_asesor))
   then raise exception 'Aislamiento de vista fallido: %',c.label; end if;
  select count(*) into v from public.dictamenes_con_asesor;
  foreach t in array array['dictamen_clientes','dictamen_puntos','dictamen_historial','dictamen_revisiones'] loop
   execute format('select count(*) from public.%I',t) into n;
   select coalesce((select d.n from permiso_detalle d where d.label=c.label and d.tabla=t),0) into esperado;
   if n<>esperado then raise exception 'Detalle ajeno o incompleto: %, %',c.label,t; end if;
  end loop;
  perform set_config('request.path','/dictamen_historial_con_quien',true);
  select count(*) into n from public.dictamen_historial_con_quien;
  select coalesce((select d.n from permiso_detalle d where d.label=c.label and d.tabla='dictamen_historial'),0) into esperado;
  if n<>esperado then raise exception 'Historial de vista incorrecto: %',c.label; end if;
  if c.label='gabriela' then
   if not private.puede_dictaminar() then raise exception 'Falta gestion de dictamenes para Gabriela'; end if;
   update public.profiles set puede_dictaminar=puede_dictaminar where id=c.uid;
   if not found then raise exception 'Fallo de trigger al actualizar el perfil'; end if;
   insert into public.dictamenes(inmueble,estado,asesor_id,dictaminado_por)
   select 'Prueba transaccional de permisos','borrador',d.asesor_id,c.uid from public.dictamenes d limit 1 returning id into nuevo;
   if nuevo is null then raise exception 'Gabriela no pudo crear'; end if;
   update public.dictamenes set observaciones='Edicion de prueba' where id=nuevo;
   if not found then raise exception 'Gabriela no pudo editar'; end if;
   delete from public.dictamenes where id=nuevo;
   if not found then raise exception 'Gabriela no pudo borrar'; end if;
  end if;
  if c.label like 'asesor_%' or c.label='sin_dictamen' then
   if private.puede_dictaminar() then raise exception 'Se elevaron los permisos del asesor'; end if;
   with cambiadas as(update public.dictamenes set observaciones=observaciones returning id) select count(*) into filas from cambiadas;
   if filas<>0 then raise exception 'El asesor obtuvo escritura'; end if;
  end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c.uid,'role','authenticated','session_id',gen_random_uuid())::text,true);
  select count(*) into n from public.dictamenes;
  if n<>0 then raise exception 'Falta bloqueo MFA: %',c.label; end if;
  insert into permiso_resultado values(c.label,v,true,true);
  execute 'reset role';
 end loop;
 if has_table_privilege('authenticated','private.dictamen_lectores_globales','INSERT')
   or has_function_privilege('anon','private.dictamen_ver_todos()','EXECUTE')
   or has_function_privilege('anon','private.dictamen_asesores_propios()','EXECUTE')
 then raise exception 'ACL de permisos modificable o publica'; end if;
end $test$;
select * from permiso_resultado order by label;
rollback;
