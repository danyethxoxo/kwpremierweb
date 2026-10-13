import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
const script = readFileSync(new URL('../assets/js/inventario-local.js',import.meta.url),'utf8');
function runtime(indexedDB) {
  const context = vm.createContext({window:{indexedDB},setTimeout,clearTimeout});
  vm.runInContext(script,context);
  return context.window.kwInventarioLocal;
}

test('la descarga completa inicia tres páginas en paralelo y las reúne en orden sin truncar',async()=>{
  const filas=Array.from({length:3500},(_,i)=>({id:i})),pendientes=[];
  const sb={from(){const q={select(){return q;},eq(){return q;},order(){return q;},range(inicio,fin){
    if(inicio===0)return Promise.resolve({data:filas.slice(0,1000),count:3500});
    return new Promise(resolve=>pendientes.push({inicio,fin,resolve}));
  }};return q;}};
  const start=script.indexOf('  async function descargar(');
  const context=vm.createContext({CAMPOS:'id',Promise,Number});
  vm.runInContext(script.slice(start,script.indexOf('\n  }',start)+4),context);
  const carga=context.descargar(sb,()=>{});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(pendientes.length,3);
  pendientes.reverse().forEach(p=>p.resolve({data:filas.slice(p.inicio,p.fin+1)}));
  const resultado=await carga;
  assert.equal(resultado.length,3500);
  assert.deepEqual(Array.from(resultado,x=>x.id),filas.map(x=>x.id));
});

test('un lote truncado no se presenta como catálogo completo',async()=>{
  const sb={from(){const q={select(){return q;},eq(){return q;},order(){return q;},async range(inicio){
    return inicio===0?{data:Array(1000).fill({}),count:1500}:{data:Array(499).fill({})};
  }};return q;}};
  const start=script.indexOf('  async function descargar(');
  const context=vm.createContext({CAMPOS:'id',Promise,Number});
  vm.runInContext(script.slice(start,script.indexOf('\n  }',start)+4),context);
  await assert.rejects(context.descargar(sb,()=>{}),/incompleto/);
});
test('cache vigente muestra datos y solo consulta la versión',async()=>{
  const api = runtime(), filas = [{id:'a'}], estados = [], recibidas = [];
  let descargas = 0;
  await api.sincronizar({leer:async()=>({esquema:1,version:'v1',filas}),version:async()=>'v1',
    descargar:async()=>{descargas++;return [];},guardar:async()=>{},datos:f=>recibidas.push(f),estado:e=>estados.push(e)});
  assert.equal(descargas,0); assert.equal(recibidas[0],filas);
  assert.match(estados.at(-1),/actualizado/);
});
test('primera carga y nueva versión reemplazan el catálogo completo, incluidas bajas',async()=>{
  const api=runtime(); let almacenado=null;
  await api.sincronizar({leer:async()=>null,version:async()=>'v1',descargar:async()=>[{id:'a'},{id:'b'}],
    guardar:async c=>{almacenado=c;},datos:()=>{},estado:()=>{}});
  await api.sincronizar({leer:async()=>almacenado,version:async()=>'v2',descargar:async()=>[{id:'a',estatus:'suspendida'}],
    guardar:async c=>{almacenado=c;},datos:()=>{},estado:()=>{}});
  assert.equal(almacenado.version,'v2'); assert.equal(almacenado.filas.length,1); assert.equal(almacenado.filas[0].estatus,'suspendida');
});
test('fallo de red conserva cache y avisa; primera carga sin conexión falla claramente',async()=>{
  const api=runtime(), estados=[], filas=[{id:'a'}];
  const opciones={leer:async()=>({esquema:1,version:'v1',filas}),version:async()=>{throw new Error('sin red');},descargar:async()=>[],guardar:async()=>assert.fail(),datos:()=>{},estado:e=>estados.push(e)};
  assert.equal(await api.sincronizar(opciones),filas);
  assert.match(estados.at(-1),/no se pudo comprobar/);
  await assert.rejects(api.sincronizar({...opciones,leer:async()=>null}),/sin red/);
});
test('una descarga cambiante o incompleta nunca sobrescribe una copia buena',async()=>{
  const api=runtime(); let version=0,guardados=0;
  const filas=[{id:'previa'}];
  const resultado=await api.sincronizar({leer:async()=>({esquema:1,version:'vieja',filas}),version:async()=>String(++version),
    descargar:async()=>[{id:'mezcla'}],guardar:async()=>{guardados++;},datos:()=>{},estado:()=>{}});
  assert.equal(guardados,0); assert.equal(resultado,filas);
});
test('IndexedDB persiste entre páginas y no comparte caché entre cuentas',async()=>{
  const indexedDB=new IDBFactory(); let descargas=0, usuario='asesor-a';
  const sb={auth:{getSession:async()=>({data:{session:{user:{id:usuario}}}})},from:()=>{
    const q={select:campo=>{q.version=campo==='id,updated_at';return q;},eq:()=>q,order:()=>q,
      limit:async()=>({data:[{id:'a',updated_at:'2026-09-30'}]}),range:async()=>{descargas++;return {data:[{id:'a',estatus:'publicada'}]};}};return q;
  }};
  const callbacks={datos:()=>{},estado:()=>{}};
  await runtime(indexedDB).cargar(sb,callbacks); assert.equal(descargas,1);
  await runtime(indexedDB).cargar(sb,callbacks); assert.equal(descargas,1);
  usuario='asesor-b'; await runtime(indexedDB).cargar(sb,callbacks); assert.equal(descargas,2);
});
test('navegador sin almacenamiento conserva el funcionamiento sin caché persistente',async()=>{
  const api=runtime(); const estados=[];
  const sb={auth:{getSession:async()=>({data:{session:{user:{id:'a'}}}})},from:()=>{
    const q={select:()=>q,eq:()=>q,order:()=>q,limit:async()=>({data:[]}),range:async()=>({data:[]})};return q;
  }};
  await api.cargar(sb,{datos:()=>{},estado:e=>estados.push(e)});
  assert.match(estados.at(-1),/no permitió guardarlo/);
});
