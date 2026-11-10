import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {PGlite} from '@electric-sql/pglite';
const root=new URL('../',import.meta.url),sql=fs.readFileSync(new URL('supabase/migrations/20261110175341_busqueda_integrada_descripciones_hospitales.sql',root),'utf8');
test('busca descripción y sinónimos, verifica distancia y evita cercanías negadas',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table public.propiedades(titulo text,descripcion text,asesor_nombre text,calle text,colonia text,municipio text,estado text,market_center text,fuente_id text,cp text);
 create function public.propiedad_palabras_normalizar(text) returns text language sql immutable as $$select lower($1)$$;
 create function public.propiedad_palabras_consulta(text) returns tsquery language sql immutable as $$select plainto_tsquery('spanish',$1)$$;`);
 await db.exec(sql.slice(0,sql.indexOf('CREATE OR REPLACE FUNCTION public.propiedades_inventario_filtradas')));
 await db.exec(`insert into public.propiedades_puntos_interes(id,nombre,lat,lng,fuente,consultado_at,categoria)values('qa','Hospital prueba',19.4,-99.15,'https://example.com',now(),'hospital');`);
 const scalar=async(q)=>(await db.query(q)).rows[0].v;
 assert.equal(await scalar(`select public.propiedad_texto_busqueda('Depa','Listo para renovar',null,null,null,null,null,null,null,null) @@ public.propiedad_consulta_conceptos('[ ["remodelar","renovar"] ]',null) as v`),true);
 assert.equal(await scalar(`select public.propiedad_texto_busqueda('Casa','Sin terraza',null,null,null,null,null,null,null,null) @@ public.propiedad_consulta_conceptos('[["alberca"],["terraza"]]',null) as v`),false);
 assert.equal((await scalar(`select public.propiedad_hospital_evidencia(19.401,-99.15,'',1500) as v`)).tipo,'coordenadas');
 assert.equal(await scalar(`select public.propiedad_hospital_evidencia(20,-100,'hospital en la ciudad',1500) as v`),null);
 assert.equal((await scalar(`select public.propiedad_hospital_evidencia(null,null,'Departamento cerca del hospital',1500) as v`)).tipo,'descripcion');
 assert.equal(await scalar(`select public.propiedad_hospital_evidencia(null,null,'Lejos del hospital',1500) as v`),null);
 assert.equal(await scalar(`select public.propiedad_hospital_evidencia(null,null,'No hay hospital cerca',1500) as v`),null);
 assert.equal(await scalar(`select public.propiedad_hospital_evidencia(19.42,-99.15,'',1500) as v`),null);
 }finally{await db.close();}
});
test('un solo buscador conserva filtros, interpreta ejemplo sin cuota, cachea y recupera errores',async()=>{
 const window={},s=vm.createContext({window,Map,Set,console,Response});
 vm.runInContext(fs.readFileSync(new URL('assets/js/kw-busqueda-ia.js',root),'utf8'),vm.createContext({window,document:{readyState:'loading',addEventListener(){}}}));
 vm.runInContext(fs.readFileSync(new URL('assets/js/kw-buscador-inteligente.js',root),'utf8'),s);
 let calls=0;const criteria={tipos:['Departamento'],estados:[],municipios:[],colonias:[],requisitos:['remodelar'],conceptos:[['remodelar','renovar']],dudas:[],precio_max:5000000};
 const sb={functions:{invoke:async()=>{calls++;return {data:{ok:true,criterios:criteria}};}}};
 let r=await window.kwBuscadorInteligente.buscar({texto:'Depa cerca de hospital',maximo:4000000},sb);
 assert.equal(calls,0);assert.equal(r.filtros.cerca_hospital_m,1500);assert.equal(r.filtros.maximo,4000000);assert.equal(r.filtros.texto,'');assert.equal(r.resumen,'');
 for(const texto of ['Narvarte Poniente','Gustavo Solares Campos','117 Gutenberg','terraza']){const literal=await window.kwBuscadorInteligente.buscar({texto},sb);assert.equal(literal.filtros.texto,texto);}
 assert.equal(calls,0,'las búsquedas literales no esperan a la IA');
 const simple=await window.kwBuscadorInteligente.buscar({texto:'depa en renta'},sb);assert.equal(simple.filtros.operacion[0],'renta');assert.equal(calls,0);
 r=await window.kwBuscadorInteligente.buscar({texto:'Departamento para remodelar',maximo:4000000},sb);assert.equal(r.filtros.maximo,4000000);assert.equal(r.filtros.conceptos[0][1],'renovar');
 await window.kwBuscadorInteligente.buscar({texto:'Departamento para remodelar'},sb);assert.equal(calls,1);
 r=await window.kwBuscadorInteligente.buscar({texto:'Depa cerca de hospital',tipo:['Casa']},sb);assert.equal(r.filtros.sin_coincidencias,true);
 const fallback=await window.kwBuscadorInteligente.buscar({texto:'Casa cerca de parques'},{functions:{invoke:async()=>({error:true})}});assert.equal(fallback.filtros.texto,'Casa cerca de parques');assert.match(fallback.resumen,/por texto/);
 const html=fs.readFileSync(new URL('propiedades.html',root),'utf8');assert.ok(!html.includes('data-kw-busqueda-ia="propiedades"'));assert.equal((html.match(/id="f-buscar"/g)||[]).length,1);
});
