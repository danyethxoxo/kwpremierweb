import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function motor(){const scope=vm.createContext({AbortController,setTimeout,clearTimeout});vm.runInContext(readFileSync(new URL('../assets/js/comprador-cargas.js',import.meta.url),'utf8'),scope);return scope.kwCompradorCargas;}
test('paginas comparten solicitudes y cache; nueva revision obtiene datos nuevos',async()=>{
 const loader=motor();let llamadas=0;
 const sb={rpc:()=>({abortSignal:async()=>{llamadas++;await new Promise(r=>setTimeout(r,5));return{data:[{propiedad:{id:llamadas}}]};}})};
 const [a,b]=await Promise.all([loader.pagina(sb,'a','r1',100,0),loader.pagina(sb,'a','r1',100,0)]);
 assert.equal(llamadas,1);assert.deepEqual(a,b);
 await loader.pagina(sb,'a','r1',100,0);assert.equal(llamadas,1);
 await loader.pagina(sb,'a','r2',100,0);assert.equal(llamadas,2);
 await loader.pagina(sb,'b','r1',100,0);assert.equal(llamadas,3);
});
test('reintenta una interrupcion temporal pero no errores de autorizacion',async()=>{
 const loader=motor();let llamadas=0;
 const sb={rpc:()=>({abortSignal:async()=>++llamadas===1?{error:{code:'57014'},status:503}:{data:[]}})};
 await loader.pagina(sb,'a','r1',90,0);assert.equal(llamadas,2);
 const denied={rpc:()=>({abortSignal:async()=>{llamadas++;return{error:{code:'42501'},status:403};}})};
 await assert.rejects(loader.pagina(denied,'a','r1',80,0));assert.equal(llamadas,3);
});
