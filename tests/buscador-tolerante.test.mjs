import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const asesores=['Adriana García López','Adriana Pérez','María Adriana García','Rodrigo Martínez','Adriano Torres'];
const lugares=[{estado:'Ciudad de México',municipio:'Benito Juárez',colonia:'Narvarte Poniente'},{estado:'Ciudad de México',municipio:'Benito Juárez',colonia:'Narvarte Oriente'}];
function entorno(){const window={},s=vm.createContext({window,Map,Set,Date,console,document:{readyState:'loading',addEventListener(){}}});for(const p of ['kw-busqueda-ia','kw-busqueda-tolerante','kw-buscador-inteligente'])vm.runInContext(fs.readFileSync(new URL('assets/js/'+p+'.js',root),'utf8'),s);return window;}
test('dedazos, plural y acentos sin alterar cifras o negaciones; rechaza coincidencias ambiguas',()=>{
 const t=entorno().kwBusquedaTolerante;
 assert.equal(t.corregir('cass'),'casa');assert.equal(t.corregir('csa'),'casa');assert.equal(t.corregir('casas en rentta'),'casa en renta');assert.equal(t.corregir('depa con albercca sin elevador hasta 4.5 millones'),'depa con alberca sin elevador hasta 4.5 millones');assert.equal(t.corregir('ABC123CSA 842678 sin cama ni cava'),'ABC123CSA 842678 sin cama ni cava');
 assert.equal(t.mejor('mari',['maria','mario']),null);assert.equal(t.corregirLugar('Narvate',lugares,'colonia'),'narvarte');
 assert.deepEqual(Array.from(t.resolverAsesores('adriana',asesores)),asesores.slice(0,3));
 assert.deepEqual(Array.from(t.resolverAsesores('adriana garcia',asesores)),[asesores[0],asesores[2]]);
 assert.deepEqual(Array.from(t.resolverAsesores('adrianna garcai',asesores)),[asesores[0],asesores[2]]);
 assert.throws(()=>t.resolverAsesores('adriana apellido inexistente',asesores),/asesor/);
 assert.equal(t.separarAsesor('depa cerca de hospital'),null);
 assert.equal(t.separarAsesor('casas de Rodrigo').texto,'casa');
 assert.equal(t.separarAsesor('todas las propiedades de Adriana García').nombre,'Adriana García');
 assert.equal(t.separarAsesor('casas de Rodrigo en renta').texto,'casa en renta');
});
test('busca todos los agentes por nombre y acota por apellido manteniendo filtros y velocidad',async()=>{
 const w=entorno();let ia=0,rpcs=[];
 const sb={functions:{invoke:async()=>{ia++;return {data:{ok:true,criterios:{tipos:['Casa'],estados:[],municipios:[],colonias:[],requisitos:['terraza'],conceptos:[['terraza']],asesores:[],dudas:[]}}};}},rpc:async(n,a)=>{rpcs.push(a.p_campo);return {data:a.p_campo==='asesor_nombre'?asesores.map(asesor_nombre=>({asesor_nombre})):lugares,error:null};}};
 let r=await w.kwBuscadorInteligente.buscar({texto:'cass',maximo:5000000},sb);assert.deepEqual(Array.from(r.filtros.tipo),['Casa']);assert.equal(r.filtros.maximo,5000000);assert.equal(ia,0);assert.equal(rpcs.length,0);
 r=await w.kwBuscadorInteligente.buscar({texto:'todas las propiedades de adriana',maximo:4000000},sb);assert.equal(r.filtros.asesor.length,3);assert.equal(r.filtros.tipo,undefined);assert.equal(r.filtros.texto,'');assert.equal(r.filtros.maximo,4000000);
 r=await w.kwBuscadorInteligente.buscar({texto:'todas las propiedades de adriana garcia'},sb);assert.equal(r.filtros.asesor.length,2);
 r=await w.kwBuscadorInteligente.buscar({texto:'cass de rodrgo en renta',estatus:'publicada'},sb);assert.deepEqual(Array.from(r.filtros.asesor),[asesores[3]]);assert.deepEqual(Array.from(r.filtros.tipo),['Casa']);assert.deepEqual(Array.from(r.filtros.operacion),['renta']);assert.equal(r.filtros.estatus,'publicada');assert.equal(ia,0);assert.equal(rpcs.filter(c=>c==='asesor_nombre').length,1);
 r=await w.kwBuscadorInteligente.buscar({texto:'casas de adriana',asesor:[asesores[3]]},sb);assert.equal(r.filtros.sin_coincidencias,true);
 r=await w.kwBuscadorInteligente.buscar({texto:'propiedades de nombre inexistente'},sb);assert.equal(r.filtros.sin_coincidencias,true);assert.equal(r.filtros.texto,'');
 r=await w.kwBuscadorInteligente.buscar({texto:'Narvate'},sb);assert.equal(r.filtros.texto,'narvarte');assert.equal(ia,0);
 r=await w.kwBuscadorInteligente.buscar({texto:'casas de Adriana con terraza'},sb);assert.equal(r.filtros.asesor.length,3);assert.equal(r.filtros.conceptos[0][0],'terraza');assert.equal(ia,1);
});
