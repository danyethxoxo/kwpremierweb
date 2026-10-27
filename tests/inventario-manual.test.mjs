import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=fs.readFileSync(new URL('../supabase/functions/inventario-diario/index.ts',import.meta.url),'utf8');
async function ejecutar(body, autorizado=true, completa=true) {
  let handler;const llamadas=[];
  const q=new Proxy({}, {get(_t,key){if(key==='then')return resolve=>resolve({data:{ultimo_cursor:new Date().toISOString(),ultimo_error:null,enviado_at:new Date().toISOString()},error:null});return()=>q;}});
  const ctx=vm.createContext({Response,Date,AbortSignal,console,
    Deno:{env:{get:()=> 'configurado'}},secureServe:(_op,fn)=>{handler=fn;},createClient:()=>({from:()=>q}),
    enviarCorreo:async()=>{throw Error('No debe enviar correo');},
    fetch:async url=>{llamadas.push(url);return Response.json({ok:true,corrida_completa:completa});},
  });
  vm.runInContext(stripTypeScriptTypes(source.replace(/^import .*\n/gm,'')),ctx);
  const res=await handler(new Request('https://example.com',{method:'POST',headers:{'x-webhook-secret':autorizado?'configurado':'incorrecto'},body:JSON.stringify(body)}));
  return {res,llamadas,body:await res.json()};
}
test('lectura manual fuerza sincronizacion aunque ya se completo el periodo y no envia reporte',async()=>{
  const r=await ejecutar({solo_sincronizar:true});assert.equal(r.res.status,200);assert.equal(r.body.lectura.corrida_completa,true);
  assert.equal(r.llamadas.length,1);assert.ok(r.llamadas[0].endsWith('/sincronizar-propiedades'));
});
test('cron conserva omision del periodo y exige secreto; lectura incompleta no se declara exitosa',async()=>{
  const normal=await ejecutar({});assert.equal(normal.body.omitido,true);assert.equal(normal.llamadas.length,0);
  const sinPermiso=await ejecutar({solo_sincronizar:true},false);assert.equal(sinPermiso.res.status,401);assert.equal(sinPermiso.llamadas.length,0);
  const incompleta=await ejecutar({solo_sincronizar:true},true,false);assert.equal(incompleta.res.status,502);
});
