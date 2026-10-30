import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {chromium} from 'playwright';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=s=>stripTypeScriptTypes(s.replace(/^import .*\n/gm,'').replace(/^export /gm,''));
function contexto(){const c=vm.createContext({URL,TextDecoder,Uint8Array,Deno:{env:{get:()=>''}}});vm.runInContext(js(read('supabase/functions/_shared/email-utf8.ts'))+'\n'+js(read('supabase/functions/_shared/mailer.ts'))+'\n'+js(read('supabase/functions/_shared/comprador-email.ts')),c);return c;}
const id='11111111-1111-4111-8111-111111111111';
const propiedad={id:'22222222-2222-4222-8222-222222222222',titulo:'Casa con terraza en Del Valle',precio:7000000,moneda:'MXN',operacion:'venta',tipo:'Casa',imagen:'https://fotos.test/casa.jpg',enlace_kw:'https://kw.com/es-419/property/Casa-CDMX/123456',recamaras:3,banos:2,estacionamientos:2,m2_construccion:180,colonia:'Del Valle',municipio:'Benito Juárez',estado:'Ciudad de México',asesor_nombre:'Asesor de la propiedad',market_center:'KW Premier'};
const contenido={clientes:[{id,nombre:'Diana Omana',propiedades:[propiedad]}]};

test('enlaza al asesor que publicó la propiedad y omite identificadores inválidos',()=>{
 const c=contexto();
 const render=p=>c.correoCoincidencias({clientes:[{id,nombre:'Diana',propiedades:[{...propiedad,...p}]}]},{});
 const mail=render({asesor_nombre:'Griselda Pantoja',asesor_kw_id:'545212'});
 assert.ok(mail.html.includes('https://kw.com/es-419/agent/griselda-pantoja/545212'));
 assert.ok(mail.html.includes('Ver perfil del asesor'));assert.ok(mail.text.includes('/agent/griselda-pantoja/545212'));
 assert.ok(!render({asesor_kw_id:'123/otro'}).html.includes('Ver perfil del asesor'));
 assert.ok(!render({asesor_nombre:'',asesor_kw_id:'545212'}).html.includes('Ver perfil del asesor'));
});
test('correo incluye foto, datos, dos enlaces y singular/plural; escapa HTML y valida destinos',()=>{
 const c=contexto(),mail=c.correoCoincidencias(contenido,{nombre:'Daniel',sitio_web:'daniguerrero.kw.com'});
 assert.equal(mail.asunto,'1 nueva propiedad que le puede interesar a Diana Omana');assert.ok(mail.html.includes('https://fotos.test/casa.jpg'));assert.ok(mail.html.includes('$7,000,000 MXN'));assert.ok(mail.html.includes('3 recámaras'));assert.ok(mail.html.includes('180 m² de construcción'));
 assert.ok(mail.html.includes('https://daniguerrero.kw.com/es-419/property/Casa-CDMX/123456'));assert.ok(mail.html.includes('/hub/perfil-comprador.html?perfil='+id));assert.ok(mail.html.includes('Abrir perfil comprador'));
 assert.equal(c.correoCoincidencias({clientes:[{...contenido.clientes[0],propiedades:[propiedad,propiedad]}]},{}).asunto,'2 nuevas propiedades que le pueden interesar a Diana Omana');
 const malo=c.correoCoincidencias({clientes:[{id,nombre:'<script>',propiedades:[{...propiedad,titulo:'<img src=x onerror=alert(1)>',imagen:'javascript:alert(1)',enlace_kw:'https://kw.com.attacker.test/robar'}]}]},{});
 assert.ok(malo.html.includes('&lt;img'));assert.equal(malo.html.includes('src="javascript:'),false);assert.equal(malo.html.includes('href="https://kw.com.attacker'),false);assert.equal(c.correoCoincidencias(null,{}),null);
 const muchos=c.correoCoincidencias({clientes:[{id,nombre:'Cliente',propiedades:Array(25).fill(propiedad)}]},{});assert.equal((muchos.html.match(/Ver propiedad en KW/g)||[]).length,10);assert.ok(muchos.html.includes('Hay 15 más'));
});
test('cola captura solo propiedades nuevas, compatibles y del asesor correcto, sin cambiar al reintentar',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema private;
   create table notificaciones(id uuid primary key,user_id uuid,tipo text);
   create table comprador_correo_envios(notificacion_id uuid primary key references notificaciones(id));
   create table perfiles_comprador(id uuid primary key,nombre text,asesor_id uuid,activo boolean,avisos_correo boolean,umbral_match integer);
   create table comprador_estados(perfil_id uuid,pendiente boolean);
   create table propiedades(id uuid primary key,titulo text,precio numeric,moneda text,tipo text,operacion text,colonia text,municipio text,estado text,recamaras integer,banos numeric,estacionamientos integer,m2_construccion numeric,m2_terreno numeric,imagenes jsonb,fuente text,fuente_id text,market_center text,asesor_nombre text,created_at timestamptz default now(),estatus text);
   create view propiedades_inventario as select id, null::text as miniatura_url,'https://kw.com/es-419/property/Prueba/123'::text as enlace_kw from propiedades;
   create table comprador_resultados(perfil_id uuid,propiedad_id uuid,asesor_id uuid,vigente boolean,notificado_at timestamptz,categoria text,porcentaje integer);
   create function comprador_requisitos_duros(perfiles_comprador,propiedades) returns boolean language sql as $$select true$$;
   insert into perfiles_comprador values('${id}','Diana','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,true,80),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Otro cliente','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true,true,80);
   insert into comprador_estados select id,false from perfiles_comprador;
   insert into propiedades(id,titulo,precio,moneda,imagenes,estatus) values('${propiedad.id}','Casa de prueba',7000000,'MXN','["https://fotos.test/casa.jpg"]','publicada');
   insert into comprador_resultados values('${id}','${propiedad.id}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,null,'fuertes',100),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${propiedad.id}','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true,null,'fuertes',100);
  `);
  await db.exec(read('supabase/sql/130_comprador_correo_propiedades.sql'));
  await db.exec("create or replace view propiedades_inventario as select id,null::text as miniatura_url,'https://kw.com/es-419/property/Prueba/123'::text as enlace_kw,'545212'::text as asesor_kw_id from propiedades;");
  await db.exec(read('supabase/sql/131_comprador_correo_perfil_asesor.sql'));await db.exec('create trigger cola after insert on notificaciones for each row execute function private.comprador_registrar_correo();');
  await db.exec(`insert into notificaciones values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','comprador_matches');`);
  const snapshot=(await db.query('select contenido from comprador_correo_envios')).rows[0].contenido;assert.equal(snapshot.clientes.length,1);assert.equal(snapshot.clientes[0].nombre,'Diana');assert.equal(snapshot.clientes[0].propiedades[0].precio,7000000);assert.equal(snapshot.clientes[0].propiedades[0].asesor_kw_id,'545212');
  await db.exec("update propiedades set precio=8000000;update comprador_resultados set notificado_at=now();");assert.deepEqual((await db.query('select contenido from comprador_correo_envios')).rows[0].contenido,snapshot);
  await db.exec(`insert into notificaciones values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','comprador_matches');`);assert.equal((await db.query("select contenido from comprador_correo_envios where notificacion_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'")).rows[0].contenido.clientes.length,0);
 }finally{await db.close();}
});
test('preview del correo se adapta al movil sin cortar imagen, datos ni botones',async()=>{
 const c=contexto();const html=c.correoCoincidencias({clientes:[{...contenido.clientes[0],propiedades:[{...propiedad,asesor_nombre:'Griselda Pantoja',asesor_kw_id:'545212'}]}]},{nombre:'Daniel',sitio_web:'daniguerrero.kw.com'}).html;
 const browser=await chromium.launch({channel:'chrome'});try{
  for(const width of [640,390,320]){
   const page=await browser.newPage({viewport:{width,height:1000}});await page.route('https://fotos.test/**',r=>r.fulfill({path:path.join(root,'assets/img/logo-kw-premier.png')}));
   await page.setContent(html);assert.equal(await page.getByRole('link',{name:'Ver propiedad en KW',exact:true}).count(),1);assert.equal(await page.getByRole('link',{name:'Abrir perfil comprador',exact:true}).count(),1);assert.equal(await page.getByRole('link',{name:'Ver perfil del asesor',exact:true}).count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   fs.mkdirSync(path.join(root,'outputs/comprador'),{recursive:true});await page.screenshot({path:path.join(root,'outputs/comprador/correo-'+width+'.png'),fullPage:true});await page.close();
  }
 }finally{await browser.close();}
});

