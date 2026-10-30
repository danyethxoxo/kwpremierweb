import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const js=s=>stripTypeScriptTypes(s.replace(/^import .*\n/gm,'').replace(/^export /gm,''));
const personas=[
 {email:'dani.guerrero@kwmexico.mx',role:'master',puesto:'Technology Director'},
 {email:'dt@example.com',role:'admin',puesto:'Technology Director'},
 {email:'tl@example.com',role:'staff',puesto:'Team Leader'},
 {email:'carol.silva@kwmexico.mx',nombre:'Carol',apellido:'Silva',role:'staff',puesto:'Productivity Coach'},
 {email:'almendra.nunez@kwmexico.mx',nombre:'Almendra',apellido:'Nuñez',role:'staff',puesto:'Productivity Coach'},
];
function contexto(){const c=vm.createContext({TextDecoder,Uint8Array,Deno:{env:{get:()=>''}}});vm.runInContext(js(read('supabase/functions/_shared/email-utf8.ts'))+'\n'+js(read('supabase/functions/_shared/mailer.ts'))+'\n'+js(read('supabase/functions/_shared/dictamen-email.ts'))+'\n'+js(read('supabase/functions/_shared/dictamen-destinatarios.ts')),c);return c;}
test('liderazgo: solo Dani, DT y PC asignado, sin enviar a las otras PC ni a TL',()=>{
 const c=contexto();
 for(const coach of ['carol.silva@kwmexico.mx','Carol Silva','Sheila Carol Silva Dritrit'])assert.deepEqual(Array.from(c.destinatariosDictamenLiderazgo(personas,coach).correos),['dani.guerrero@kwmexico.mx','dt@example.com','carol.silva@kwmexico.mx']);
 for(const coach of ['', 'PC desconocida'])assert.deepEqual(Array.from(c.destinatariosDictamenLiderazgo(personas,coach).correos),['dani.guerrero@kwmexico.mx','dt@example.com']);
 assert.equal(c.destinatariosDictamenLiderazgo(personas,'María Almendra Núñez Moreno').pcEncontrado,true);
 const correo=c.correoDictamen('María <López>','Av. Juárez 12','condicionada',true,'liderazgo');
 assert.equal(correo.asunto,'Dictamen de expediente: Autorizado condicionado');
 assert.ok(correo.html.includes('Dictamen de María &lt;López&gt; con dirección:'));assert.ok(correo.html.includes('Ver en la plataforma'));assert.ok(correo.html.includes('Incluye un PDF'));assert.equal(correo.html.includes('Hola:'),false);
});
test('Guardar y enviar adjunta ambos PDF a cada grupo con texto acorde al destinatario',async()=>{
 for(const caso of ['todos','asesor','mca','fallo']){
  const modo=caso==='fallo'?'todos':caso;
  let handler;const envios=[],auditoria=[];const helper=contexto();
  const c=vm.createContext({Response,Request,TextDecoder,Uint8Array,atob,console,
   Deno:{env:{get:()=>'configurado'}},secureServe:(_,fn)=>{handler=fn;},console:{error(){}},
   prepararCorreoUtf8:x=>x,correoDictamen:helper.correoDictamen,destinatariosDictamenLiderazgo:helper.destinatariosDictamenLiderazgo,
   createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'operador',email:'operador@example.com'}}})},from(table){let campos='';const valor=()=>table==='profiles'?(campos.includes('puede_dictaminar')?{role:'master'}:personas):table==='dictamenes'?{id:'11111111-1111-4111-8111-111111111111',asesor_id:'asesor',inmueble:'Av. Juárez 12',estado:'devuelta'}:table==='dictamen_asesores'?{nombre:'María López',correo:'asesor@example.com'}:{coach_asignado:'Carol Silva'};const q={insert(datos){if(table==='dictamen_historial')auditoria.push(datos);return q;},select(s){campos=s;return q;},eq(){return q;},in(){return q;},single:async()=>({data:valor()}),maybeSingle:async()=>({data:valor()}),then(ok,bad){return Promise.resolve({data:valor()}).then(ok,bad);}};return q;}}),
   fetch:async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');envios.push(JSON.parse(init.body));return new Response('{}',{status:caso==='fallo'?502:200});},
  });
  vm.runInContext(js(read('supabase/functions/enviar-dictamen-email/index.ts')),c);
  const pdf=Buffer.from('%PDF-1.4\nprueba').toString('base64');
  const respuesta=await handler(new Request('https://local.test',{method:'POST',headers:{Authorization:'Bearer prueba'},body:JSON.stringify({dictamen_id:'11111111-1111-4111-8111-111111111111',destinatario:modo,pdf_solo_datos:pdf,pdf_con_correcciones:pdf})}));
  if(caso==='fallo'){assert.equal(respuesta.status,502);assert.equal(auditoria.length,0);continue;}
  assert.equal(respuesta.status,200);assert.equal(envios.length,modo==='todos'?2:1);assert.equal(auditoria.length,envios.length);assert.ok(auditoria.every(h=>h.que==='correo_enviado'&&h.detalle.startsWith('Se envi\u00f3 a ')));
  for(const e of envios){assert.equal(e.attachments.length,2);assert.equal(e.attachments[0].content,pdf);assert.equal(e.html.includes('Hola:'),e.to.includes('asesor@example.com'));}
  if(modo==='todos')assert.deepEqual(envios[1].to,['fernanda.pacheco@kwmexico.mx','alberto.velazquez@kwpremier.com.mx','dani.guerrero@kwmexico.mx','dt@example.com','carol.silva@kwmexico.mx']);
 }
});
test('avisos informativos para todo liderazgo, sin correo ni duplicados y con INSERT cubierto',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;
   create table profiles(id uuid,role text);create table dictamen_asesores(id uuid,nombre text);
   create table dictamenes(id uuid,asesor_id uuid,estado text,inmueble text);
   create table notificaciones(user_id uuid,tipo text,titulo text,mensaje text,url text);
   create table correos(tipo text);create function notificar_email_nueva_notificacion() returns trigger language plpgsql as $$begin insert into correos values(new.tipo);return new;end;$$;
   insert into profiles values('11111111-1111-4111-8111-111111111111','admin'),('22222222-2222-4222-8222-222222222222','staff'),('33333333-3333-4333-8333-333333333333','asociado');
   insert into dictamen_asesores values('44444444-4444-4444-8444-444444444444','María López');`);
  await db.exec(read('supabase/sql/128_dictamen_liderazgo_solo_plataforma.sql'));
  await db.exec(`insert into dictamenes values('55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444','borrador','Av. Juárez 12');update dictamenes set estado='autorizada';update dictamenes set estado='autorizada';`);
  const avisos=(await db.query('select * from notificaciones')).rows;assert.equal(avisos.length,2);assert.equal(avisos[0].mensaje,'Dictamen de María López con dirección:\n\nAv. Juárez 12');
  assert.equal((await db.query('select * from correos')).rows.length,0);
  await db.exec(`insert into dictamenes values('66666666-6666-4666-8666-666666666666','44444444-4444-4444-8444-444444444444','devuelta','Otra dirección');`);assert.equal((await db.query('select * from notificaciones')).rows.length,4);
  await db.exec(`insert into notificaciones(tipo) values('ticket');`);assert.equal((await db.query('select * from correos')).rows.length,1);
 }finally{await db.close();}
});
