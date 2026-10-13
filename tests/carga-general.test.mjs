import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function api() {
  let now=100000, users=0, perfiles=0;
  const eventos=new Map();
  const ctx=vm.createContext({window:{addEventListener:(n,f)=>eventos.set(n,f)},
    WeakMap,Promise,Object,Array,Error,Date:class extends Date {static now(){return now;}}});
  vm.runInContext(fs.readFileSync(new URL('../assets/js/kw-session.js',import.meta.url),'utf8'),ctx);
  const client={auth:{async getUser(){users++;return {data:{user:{id:'u',email:'u@example.com'}}};}},
    from(tabla){assert.equal(tabla,'profiles');return {select(campos){assert.equal(campos,'*');return this;},
      eq(campo,id){assert.equal(campo,'id');assert.equal(id,'u');return this;},
      async single(){perfiles++;return {data:{id:'u',role:'staff'},error:null};}};}};
  return {api:ctx.window.kwSession,client,ctx,eventos,counts:()=>({users,perfiles}),tick:()=>{now+=15001;}};
}

test('el arranque comparte la respuesta verificada entre widgets sin nuevas consultas',async()=>{
  const x=api();
  x.api.prepararInicio(x.client,{verificado:true,usuario:{id:'u',email:'u@example.com'},perfil:{id:'u',role:'staff',nombre:'QA'}});
  const widgets=await Promise.all(Array.from({length:20},()=>Promise.all([x.api.usuarioInicial(x.client),x.api.perfilInicial(x.client)])));
  assert.deepEqual(x.counts(),{users:0,perfiles:0});
  assert.equal(widgets[0][0].data.user.id,'u');
  assert.equal(widgets[0][1].data.nombre,'QA');
  widgets[0][1].data.role='master';
  assert.equal((await x.api.perfilInicial(x.client)).data.role,'staff');
  await x.api.usuario(x.client);
  assert.equal(x.counts().users,1,'las comprobaciones fuera del arranque siguen consultando al servidor');
});

test('no reutiliza respuestas sin MFA, cuentas distintas, arranques expirados ni perfiles editados',async()=>{
  for(const caso of ['sin-mfa','otra-cuenta','expirado','limpiado','perfil-editado']){
    const x=api();
    x.api.prepararInicio(x.client,{verificado:caso!=='sin-mfa',usuario:{id:'u'},perfil:{id:caso==='otra-cuenta'?'otro':'u',role:'staff'}});
    if(caso==='expirado')x.tick();
    if(caso==='limpiado')x.api.limpiarInicio(x.client);
    if(caso==='perfil-editado'){x.ctx.window.kwSupabase=x.client;x.eventos.get('kw-marca-actualizada')();}
    await Promise.all([x.api.perfilInicial(x.client),x.api.perfilInicial(x.client)]);
    assert.deepEqual(x.counts(),{users:1,perfiles:1},caso);
  }
});

test('Firmas comienza la descarga antes de los catálogos, pero pinta con nombres y colores listos',async()=>{
  const html=fs.readFileSync(new URL('../hub/firmas.html',import.meta.url),'utf8');
  const start=html.indexOf('  async function cargarEnvios('),end=html.indexOf('\n  }',start)+4;
  let soltar,lecturas=0,pintados=0;
  const catalogos=new Promise(resolve=>{soltar=resolve;});
  const ctx=vm.createContext({veTodo:false,envios:[],elegidos:new Set(),Set,Promise,
    window:{kwSupabase:{from(){return {select(){return this;},order(){return this;},async range(){lecturas++;return {data:[{id:'1'}]};}};}}},
    pintarEnvios(){pintados++;},escapar:String,$:()=>({innerHTML:''})});
  vm.runInContext(html.slice(start,end),ctx);
  const carga=ctx.cargarEnvios(catalogos);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(lecturas,1);assert.equal(pintados,0);
  soltar();await carga;
  assert.equal(pintados,1);
});
