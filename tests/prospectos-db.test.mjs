import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const dir=new URL('../supabase/migrations/',import.meta.url),file=readdirSync(dir).find(p=>p.endsWith('_prospectos_piloto_privado_gmail.sql'));
const migration=readFileSync(new URL(file,dir),'utf8');
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',session='00000000-0000-4000-8000-000000000003';
async function setup(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users,active boolean default true);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.uid',true),'')::uuid$$;
create function public.mfa_sesion_autorizada() returns boolean language sql stable as $$select coalesce(current_setting('test.mfa',true),'true')<>'false'$$;
create function public.security_sesion_vigente(p_usuario uuid,p_sesion uuid) returns boolean language sql stable security definer as $$select exists(select 1 from auth.sessions where user_id=p_usuario and id=p_sesion and active)$$;
grant usage on schema auth,private to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
insert into auth.users values('${owner}','dani.guerrero@kwmexico.mx',now()),('${other}','otro@example.com',now());insert into auth.sessions values('${session}','${owner}',true);`);await db.exec(migration);return db;}
async function actor(db,id,role='authenticated'){await db.exec('reset role;');await db.query("select set_config('request.uid',$1,false)",[id]);await db.exec('set role '+role);}
test('Prospectos: solo la cuenta del piloto puede leer o escribir, sin bypass de rol',async()=>{
 const db=await setup();try{
  await actor(db,owner);assert.equal((await db.query('select public.prospectos_habilitado() acceso')).rows[0].acceso,true);
  await db.query("insert into public.prospectos_bandeja(nombre,correo)values('Prospecto real','cliente@example.com')");
  await db.query("insert into public.prospectos_reglas(remitentes)values(array['portal.example'])");
  assert.equal((await db.query('select count(*)::int n from public.prospectos_bandeja')).rows[0].n,1);
  await assert.rejects(()=>db.query('update public.prospectos_bandeja set user_id=$1',[other]),/row-level security/i);
  for(const user of [other,'00000000-0000-4000-8000-000000000099']){
   await actor(db,user);assert.equal((await db.query('select public.prospectos_habilitado() acceso')).rows[0].acceso,false);
   assert.equal((await db.query('select count(*)::int n from public.prospectos_bandeja')).rows[0].n,0);
   assert.equal((await db.query('select count(*)::int n from public.prospectos_reglas')).rows[0].n,0);
   await assert.rejects(()=>db.query("insert into public.prospectos_bandeja(nombre)values('No permitido')"),/row-level security/i);
  }
  await actor(db,owner);await db.exec("select set_config('test.mfa','false',false)");assert.equal((await db.query('select count(*)::int n from public.prospectos_bandeja')).rows[0].n,0);
  await assert.rejects(()=>db.query('select * from private.prospectos_gmail_conexiones'),/permission denied/i);
  await assert.rejects(()=>db.query("select public.prospectos_gmail_backend('estado',$1,$2)",[owner,session]),/permission denied/i);
  await actor(db,'','anon');await assert.rejects(()=>db.query('select public.prospectos_habilitado()'),/permission denied/i);
 }finally{await db.close();}
});
test('Gmail: estado ligado a usuario y sesion, consumo atomico y revocacion inmediata',async()=>{
 const db=await setup();try{
  await actor(db,owner,'service_role');const call=async(action,data={})=>(await db.query('select public.prospectos_gmail_backend($1,$2,$3,$4) r',[action,owner,session,JSON.stringify(data)])).rows[0].r;
  await call('configurar',{client_id:'123-test.apps.googleusercontent.com',secreto:{v:1,iv:'cifrado',data:'cifrado'}});
  const pending={v:1,data:'verificador-cifrado'},hash='a'.repeat(64);await call('crear_estado',{hash,verificador:pending});
  await assert.rejects(()=>db.query("select public.prospectos_gmail_backend('consumir_estado',$1,$2,$3)",[other,session,JSON.stringify({hash})]),/No autorizado/i);
  assert.deepEqual(await call('consumir_estado',{hash}),pending);assert.equal(await call('consumir_estado',{hash}),null);
  await call('conectar',{client_id:'123-test.apps.googleusercontent.com',correo:'gmail@example.com',credenciales:{v:1,data:'tokens-cifrados'},scopes:'gmail.readonly'});
  await assert.rejects(()=>call('configurar',{client_id:'otro.apps.googleusercontent.com',secreto:{}}),/Desvincula/i);
  assert.equal((await call('estado')).conexion.correo,'gmail@example.com');await call('desconectar');assert.equal((await call('estado')).conexion,null);
  await db.exec('reset role;update auth.sessions set active=false;set role service_role;');await assert.rejects(()=>call('estado'),/No autorizado/i);
 }finally{await db.close();}
});
