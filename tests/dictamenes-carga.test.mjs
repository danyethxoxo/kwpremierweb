import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source = fs.readFileSync(new URL('../hub/dictamenes.html', import.meta.url), 'utf8');
function funcion(nombre) {
  const start = source.search(new RegExp('  (?:async )?function '+nombre+'\\('));
  const end = source.indexOf('\n  }', start) + 4;
  return source.slice(start, end);
}
function sandbox(extra = {}) {
  const elements = new Map();
  return vm.createContext({ console, URL, URLSearchParams, Promise,
    dictamenes: [], puntos: [], clientes: [], historial: [], documentosEnlazados: [], listaCargando: true, puedoDictaminar:false,
    detallesListos:new Set(),detallesPendientes:new Map(),revisionDetalles:0,revisionEditor:0,abierto:null,
    $: id => { if (!elements.has(id)) elements.set(id, {setAttribute(){}, innerHTML:'',style:{}}); return elements.get(id); },
    escapar: x => x, pintar(){}, ...extra });
}
test('lista de dictamenes no descarga puntos, clientes, documentos ni historial antes de abrirlos', async () => {
  const pendientes = []; let pintado = false;
  const ctx = sandbox({pintar(){pintado=true;},window:{kwSupabase:{from(tabla){
    const query={select(){return this;},order(){return this;},not(){return this;},limit(){return new Promise(resolve=>pendientes.push({tabla,resolve}));}};return query;
  }}}});
  vm.runInContext(funcion('cargar'),ctx);
  const carga=ctx.cargar();
  assert.equal(pendientes.length,1); assert.equal(pendientes[0].tabla,'dictamenes_con_asesor'); assert.equal(pintado,false);
  pendientes.forEach((p,i)=>p.resolve({data:[{id:i}],error:null})); await carga;
  assert.equal(pintado,true);assert.equal(ctx.clientes.length,0);assert.equal(ctx.historial.length,0);
  pendientes.length=0; pintado=false;const fallo=ctx.cargar();
  pendientes.forEach((p,i)=>p.resolve({data:[],error:i===0?{message:'sin permiso'}:null}));await fallo;
  assert.equal(pintado,false); assert.match(ctx.$('lista').innerHTML,/sin permiso/);
});
test('nuevo dictamen se abre antes de terminar lista sin consultar contratos desde el arranque', async () => {
  let soltarLista;const eventos=[];
  const ctx=sandbox({yo:null,veTodo:false,puedoDictaminar:false,borrador:null,
    location:{search:'?nuevo=1',pathname:'/hub/dictamenes.html'},
    document:{querySelector(){return {}; }},
    window:{kwSupabase:{auth:{async getSession(){return {data:{session:{user:{id:'u'}}}};}},from(){return {select(){return this;},eq(){return this;},async single(){return {data:{id:'u',role:'master'}};}};}}},
    cargar(){return new Promise(r=>soltarLista=r);},cargarContratosOrigen(){throw Error('Solo el editor debe solicitar contratos');},
    async cargarCatalogos(){eventos.push('catalogos');},pintarAsesoresFiltro(){},acomodarFiltros(){},pintarContratosOrigen(){eventos.push('contratos');},
    abrirEditor(){ctx.borrador={};eventos.push('editor');}
  });
  vm.runInContext(funcion('iniciar'),ctx);const inicio=ctx.iniciar();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(eventos,['catalogos','editor']);
  soltarLista();await inicio;assert.equal(eventos.filter(x=>x==='editor').length,1);
});

test('los detalles se consultan por expediente, comparten el vuelo y no aceptan cargas parciales',async()=>{
 const pedidos=[];let fallo=false;
 const ctx=sandbox({window:{kwSupabase:{from(tabla){const q={select(){return q;},eq(campo,id){pedidos.push({tabla,campo,id});return q;},order(){return q;},async range(){await new Promise(r=>setTimeout(r,2));return{data:[{dictamen_id:'a',id:tabla}],error:fallo&&tabla==='dictamen_clientes'?{message:'fallo'}:null};}};return q;}}}});
 vm.runInContext(funcion('leerDetalleDictamen')+'\n'+funcion('cargarDetalle'),ctx);
 const primera=ctx.cargarDetalle('a');assert.equal(ctx.cargarDetalle('a'),primera);await primera;
 assert.equal(pedidos.length,4);assert.ok(pedidos.every(x=>x.campo==='dictamen_id'&&x.id==='a'));
 assert.equal(ctx.puntos.length,1);assert.equal(ctx.clientes.length,1);assert.equal(ctx.historial.length,1);
 await ctx.cargarDetalle('a');assert.equal(pedidos.length,4);
 fallo=true;await assert.rejects(()=>ctx.cargarDetalle('b'));
 assert.equal(ctx.detallesListos.has('b'),false);assert.equal(ctx.puntos.length,1);
});

test('historial de un expediente conserva todas sus paginas',async()=>{
 const rangos=[];const ctx=sandbox({window:{kwSupabase:{from(){const q={select(){return q;},eq(){return q;},order(){return q;},async range(desde,hasta){rangos.push([desde,hasta]);return{data:Array.from({length:desde===0?200:3},(_,i)=>({id:desde+i})),error:null};}};return q;}}}});
 vm.runInContext(funcion('leerDetalleDictamen'),ctx);
 assert.equal((await ctx.leerDetalleDictamen('dictamen_historial_con_quien','*','a','created_at',false)).length,203);
 assert.deepEqual(rangos,[[0,199],[200,399]]);
});
test('abrir y cerrar editor conserva la pagina y su lista cargada', () => {
  const llamadas=[];const clases={add(){},remove(){},contains(){return false;}};
  const ctx=sandbox({window:{},location:{href:'https://ejemplo.com/hub/dictamenes.html',search:'?nuevo=1',pathname:'/hub/dictamenes.html'},
    history:{pushState(a,b,url){llamadas.push(['push',url]);},replaceState(a,b,url){llamadas.push(['replace',url]);}},
    document:{body:{classList:clases},querySelector(){return {}; }},
    abrirEditor(id){llamadas.push(['editor',id]);},borrador:{},$:()=>({style:{},classList:clases})});
  vm.runInContext(funcion('navegarEditor')+'\n'+funcion('cerrarEditor'),ctx);
  ctx.navegarEditor(null);ctx.cerrarEditor();
  assert.equal(llamadas[0][0],'push');assert.match(llamadas[0][1],/nuevo=1/);
  assert.equal(llamadas[1][0],'editor');assert.equal(llamadas[2][0],'replace');
});
