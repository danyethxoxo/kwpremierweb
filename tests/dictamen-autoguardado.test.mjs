import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {chromium} from 'playwright';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/sql/129_dictamen_autoguardado_historial.sql');
test('respaldo transaccional sin revisiones, sin alterar dictamen emitido y aislado por usuario',async()=>{
 const db=new PGlite();const uno='11111111-1111-4111-8111-111111111111',dos='22222222-2222-4222-8222-222222222222',doc='33333333-3333-4333-8333-333333333333';
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;grant usage on schema private to authenticated;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('qa.user',true),'')::uuid$$;
   create function private.puede_dictaminar() returns boolean language sql as $$select current_setting('qa.permiso',true)='si'$$;
   create function public.mfa_sesion_autorizada() returns boolean language sql as $$select current_setting('qa.mfa',true)='si'$$;
   create table profiles(id uuid primary key);insert into profiles values('${uno}'),('${dos}');
   create table dictamen_asesores(id uuid primary key);
   create table dictamenes(id uuid primary key,dictaminado_por uuid,estado text default 'borrador',folio text,asesor_id uuid,inmueble text,operacion text default 'venta',uso text default 'residencial',observaciones text,estatus_listado text,archivado_at timestamptz);
   create table dictamen_historial(dictamen_id uuid references dictamenes(id) on delete cascade,que text,detalle text);
   create table dictamen_puntos(dictamen_id uuid references dictamenes(id) on delete cascade,texto text,estado text,nota text);
   create function public.dictamen_anotar(uuid,text,text) returns void language sql as $$insert into public.dictamen_historial values($1,$2,$3)$$;
   create function public.dictamen_nombre_estado(text) returns text language sql as $$select $1$$;
   select set_config('qa.user','${uno}',false),set_config('qa.permiso','si',false),set_config('qa.mfa','si',false);`);
  await db.exec(sql);await db.exec('create trigger historia after insert or update on dictamenes for each row execute function dictamen_historia();create trigger puntos after insert or update or delete on dictamen_puntos for each row execute function dictamen_punto_historia();');
  const guardar=datos=>db.query('select autoguardar_dictamen($1,$2,true)',[doc,JSON.stringify({borrador:datos,campos:{fecha:'2026-'}})]);
  await guardar({inmueble:'Primera dirección'});await guardar({inmueble:'Dirección corregida'});
  assert.equal((await db.query('select * from dictamenes')).rows.length,1);
  assert.deepEqual((await db.query('select que,detalle from dictamen_historial')).rows,[{que:'creado',detalle:'Borrador'}]);
  await db.query("insert into dictamen_puntos values($1,'Observación inicial','pendiente',null)",[doc]);
  await db.exec("update dictamen_puntos set texto='Observación editada'");assert.equal((await db.query("select * from dictamen_historial where que='punto_editado'")).rows.length,1);
  await db.exec("update dictamenes set estado='autorizada',folio='DTM01';");
  await guardar({inmueble:'Edición sin publicar'});assert.equal((await db.query('select inmueble from dictamenes')).rows[0].inmueble,'Dirección corregida');
  await db.exec(`grant select,delete on dictamenes to authenticated;alter table dictamenes enable row level security;create policy leer on dictamenes for select to authenticated using(true);set role authenticated;`);
  assert.equal((await db.query('select * from dictamen_autoguardados')).rows.length,1);
  await db.query("select set_config('qa.user',$1,false)",[dos]);assert.equal((await db.query('select * from dictamen_autoguardados')).rows.length,0);
  await db.query("select set_config('qa.permiso','no',false)");await assert.rejects(guardar({inmueble:'No permitido'}));
  await db.exec("select set_config('qa.permiso','si',false),set_config('qa.mfa','no',false)");await assert.rejects(guardar({inmueble:'Sin MFA'}));
  await db.exec("select set_config('qa.mfa','si',false);delete from dictamenes;");assert.equal((await db.query('select * from dictamenes')).rows.length,1);
  await db.exec("reset role;update dictamenes set estado='borrador',folio=null;set role authenticated;delete from dictamenes;");
  await db.exec('reset role;');assert.equal((await db.query('select * from dictamen_autoguardados')).rows.length,0);
 }finally{await db.close();}
});
test('recupera cambios locales y remotos al recargar, incluso sin conexion y sin duplicar borrador',async()=>{
 const browser=await chromium.launch({channel:'chrome'});const cloud=new Map();let fallar=false,llamadas=0;
 try{
  const page=await browser.newPage();
  await page.route('https://draft.local/**',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname==='/modulo.js')return route.fulfill({body:read('assets/js/kw-dictamen-autoguardado.js'),contentType:'application/javascript'});
   if(u.pathname==='/rpc'){
    llamadas++;const p=route.request().postDataJSON();if(fallar)return route.fulfill({json:{error:{message:'Sin conexion'}}});
    cloud.set(p.p_id,{datos:p.p_datos,updated_at:new Date().toISOString()});return route.fulfill({json:{data:p.p_id}});
   }
   if(u.pathname==='/datos')return route.fulfill({json:{data:cloud.get(u.searchParams.get('id'))||null}});
   if(u.pathname==='/quitar'){cloud.delete(u.searchParams.get('id'));return route.fulfill({json:{error:null}});}
   return route.fulfill({contentType:'text/html',body:`<div id="editor"><input id="direccion"><input id="fecha"><textarea id="nota"></textarea></div><p id="estado"></p><script src="/modulo.js"></script><script>
    const cliente={rpc:async(n,p)=>fetch('/rpc',{method:'POST',body:JSON.stringify(p)}).then(r=>r.json()),from(){let id;const q={select(){return q;},eq(k,v){if(k==='dictamen_id')id=v;return q;},maybeSingle:()=>fetch('/datos?id='+id).then(r=>r.json()),delete(){q.then=(ok,bad)=>fetch('/quitar?id='+id).then(r=>r.json()).then(ok,bad);return q;}};return q;}};
    window.draft=kwDictamenAutoguardado.crear({userId:'usuario',cliente,editor:document.getElementById('editor'),leer:()=>({borrador:{inmueble:direccion.value},campos:{fecha:fecha.value,nota:nota.value}}),restaurar:d=>{direccion.value=d.borrador.inmueble;fecha.value=d.campos.fecha;nota.value=d.campos.nota;},estado:t=>document.getElementById('estado').textContent=t});draft.abrir(null);
   </script>`});
  });
  await page.goto('https://draft.local/');await page.locator('#direccion').fill('Primera dirección');await page.waitForFunction(()=>estado.textContent==='Borrador guardado');assert.equal(cloud.size,1);const id=[...cloud.keys()][0];
  await page.reload();assert.equal(await page.locator('#direccion').inputValue(),'Primera dirección');
  fallar=true;await page.locator('#direccion').fill('Dirección sin conexión');await page.locator('#fecha').fill('2026-');await page.locator('#nota').fill('Observación aún sin agregar');await page.waitForFunction(()=>estado.textContent.includes('Respaldo local'));
  await page.reload();assert.equal(await page.locator('#direccion').inputValue(),'Dirección sin conexión');assert.equal(await page.locator('#fecha').inputValue(),'2026-');assert.equal(await page.locator('#nota').inputValue(),'Observación aún sin agregar');
  fallar=false;await page.evaluate(()=>dispatchEvent(new Event('online')));await page.waitForFunction(()=>estado.textContent==='Borrador guardado');assert.equal(cloud.size,1);assert.equal(cloud.get(id).datos.campos.nota,'Observación aún sin agregar');
  await page.locator('#nota').fill('Antes de salir');await page.reload();assert.equal(await page.locator('#nota').inputValue(),'Antes de salir');
  await page.evaluate(async id=>{await draft.pausar();await draft.completar(id);},id);await page.reload();assert.equal(await page.locator('#direccion').inputValue(),'');
  assert.ok(llamadas>=3);
 }finally{await browser.close();}
});
