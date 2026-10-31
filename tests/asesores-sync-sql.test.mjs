import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('lease de sincronización es exclusivo del servicio; Liderazgo conserva consulta y no hay acceso anónimo',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;grant usage on schema auth,private to anon,authenticated,service_role;
   create function auth.role() returns text language sql as $$select current_setting('request.role',true)$$;
   create function private.is_staff_or_above() returns boolean language sql as $$select coalesce(current_setting('request.staff',true),'false')='true'$$;
   create function public.is_staff_or_above() returns boolean language sql as $$select private.is_staff_or_above()$$;
   create function public.mfa_sesion_autorizada() returns boolean language sql as $$select true$$;
   create function public.asesores_sincronizar(p_personas jsonb) returns jsonb language plpgsql security definer as $$begin if not public.is_staff_or_above() then raise exception 'Solo liderazgo'; end if; return '{}'::jsonb; end$$;
   revoke all on function public.asesores_sincronizar(jsonb) from public;grant execute on function public.asesores_sincronizar(jsonb) to authenticated;
  `);
  let sql=fs.readFileSync(new URL('../supabase/sql/132_asesores_sincronizacion_automatica.sql',import.meta.url),'utf8').replace('alter publication supabase_realtime add table public.asesores_sync_control;','').replace(/^select cron.schedule\([^\n]+/m,'');await db.exec(sql);
  await db.exec("set role service_role;select set_config('request.role','service_role',false);");assert.equal((await db.query('select asesores_sync_iniciar() as started')).rows[0].started,true);assert.equal((await db.query('select asesores_sync_iniciar() as started')).rows[0].started,false);
  await db.exec("select asesores_sincronizar('[]'::jsonb);reset role;set role authenticated;select set_config('request.role','authenticated',false);select set_config('request.staff','false',false);");assert.equal((await db.query('select * from asesores_sync_control')).rows.length,0);
  await assert.rejects(db.query('select asesores_sync_iniciar()'),/permission denied/);await assert.rejects(db.query("select asesores_sincronizar('[]'::jsonb)"),/Solo liderazgo/);
  await db.exec("select set_config('request.staff','true',false);");assert.equal((await db.query('select * from asesores_sync_control')).rows.length,1);await db.exec("select asesores_sincronizar('[]'::jsonb);reset role;set role anon;");await assert.rejects(db.query('select * from asesores_sync_control'),/permission denied/);
 }finally{await db.close();}
});
