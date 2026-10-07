import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('guardar una revision conserva datos y estado del original y asigna numeros consecutivos',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
  create function public.mfa_sesion_autorizada() returns boolean language sql stable as $$select current_setting('test.mfa',true)='true'$$;
  create function private.is_staff_or_above() returns boolean language sql stable as $$select current_setting('test.staff',true)='true'$$;
  create table documentos_guardados(id uuid primary key default gen_random_uuid(),user_id uuid,tipo_documento text,nombre_archivo text,datos jsonb,folio text,estado text,revision int);
  insert into documentos_guardados values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','referido','Original','{"nombre":"Ana"}','F-1','finalizado',0);
  select set_config('test.uid','00000000-0000-0000-0000-000000000002',false),set_config('test.mfa','true',false),set_config('test.staff','false',false);`);
  await db.exec(read('../supabase/migrations/20261007234500_guardar_revision_documento_atomica.sql'));
  const q=`select guardar_revision_documento('00000000-0000-0000-0000-000000000001','{"nombre":"Luis"}') r`;
  const {rows:[a]}=await db.query(q),{rows:[b]}=await db.query(q);
  assert.equal(a.r.revision,1);assert.equal(b.r.revision,2);
  const {rows:[original]}=await db.query("select * from documentos_guardados where revision=0");
  assert.equal(original.estado,'finalizado');assert.equal(original.datos.nombre,'Ana');
  const {rows:revisiones}=await db.query('select * from documentos_guardados where revision>0');
  assert.equal(revisiones.length,2);assert.ok(revisiones.every(r=>r.estado==='borrador'&&r.folio==='F-1'&&r.datos.nombre==='Luis'));
  await assert.rejects(db.query("select guardar_revision_documento('00000000-0000-0000-0000-000000000001','[]')"),/Datos invalidos/);
  await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000003',false)");
  await assert.rejects(db.query(q),/permiso/);
  await db.exec("select set_config('test.uid','',false)");await assert.rejects(db.query(q),/Sesion/);
 }finally{await db.close();}
});
test('edicion local no escribe hasta guardar, evita dos creaciones simultaneas y permite reintentar',async()=>{
 let llamadas=0;
 const scope=vm.createContext({modoEdicionRevision:true,documentoRevisionOriginal:{id:'original',folio:'F-1'},revisionMaterializadaId:null,
 documentoActualId:'original',revisionActual:1,estadoActual:'borrador',actualizarVisibilidadBotones(){},updatePreview(){},
 window:{kwSupabase:{rpc:async()=>{llamadas++;await new Promise(r=>setTimeout(r,10));return {data:{id:'revision',revision:1}}}}}});
 vm.runInContext(read('../assets/js/kw-documentos-revision-local.js'),scope);
 assert.equal(llamadas,0);await Promise.all([scope.materializarRevisionLocal({}),scope.materializarRevisionLocal({})]);
 assert.equal(llamadas,1);assert.equal(scope.documentoActualId,'revision');await scope.materializarRevisionLocal({});assert.equal(llamadas,1);
 scope.revisionMaterializadaId=null;scope.window.kwSupabase.rpc=async()=>({error:new Error('temporal')});
 await assert.rejects(scope.materializarRevisionLocal({}),/temporal/);assert.equal(scope.kwRevisionGuardando,null);
});
test('lista agrupa revisiones con el original y conserva revisiones huerfanas',()=>{
 const scope=vm.createContext({});vm.runInContext(read('../assets/js/kw-documentos-lista.js'),scope);
 const filas=[{id:'o',revision:0,folio:'F-1',estado:'finalizado'},{id:'r',revision:1,folio:'F-1',estado:'borrador'},{id:'h',revision:2,folio:'F-2'}];
 const grupos=scope.agruparDocumentos(filas);assert.equal(grupos.length,2);assert.equal(grupos[0].original.id,'o');assert.equal(grupos[0].revisiones[0].id,'r');
});
test('recupera originales archivados sin modificar la revision actual y es idempotente',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create table documentos_guardados(id uuid primary key default gen_random_uuid(),user_id uuid,tipo_documento text,nombre_archivo text,datos jsonb,folio text,estado text,revision int,created_at timestamptz default now(),updated_at timestamptz default now(),finalizado_at timestamptz);
  create table documento_revisiones(documento_id uuid,revision int,contenido jsonb,created_at timestamptz default now());
  insert into documentos_guardados(id,user_id,tipo_documento,nombre_archivo,datos,folio,estado,revision) values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','referido','Revision','{"nombre":"Luis"}','F-1','borrador',1);
  insert into documento_revisiones values('00000000-0000-0000-0000-000000000001',0,'{"nombre_archivo":"Original","folio":"F-1","estado":"finalizado","datos":{"nombre":"Ana"}}',now());`);
  const sql=read('../supabase/migrations/20261007234503_recuperar_originales_archivados.sql');
  await db.exec(sql);await db.exec(sql);
  const {rows}=await db.query('select * from documentos_guardados order by revision');
  assert.equal(rows.length,2);assert.equal(rows[0].datos.nombre,'Ana');assert.equal(rows[0].estado,'finalizado');
  assert.equal(rows[1].datos.nombre,'Luis');assert.equal(rows[1].estado,'borrador');
 } finally {await db.close();}
});
