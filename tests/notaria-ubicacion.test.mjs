import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/js/kw-notaria-ubicacion.js',import.meta.url),'utf8');
const datos={estados:[{id:'09',nombre:'Ciudad de México'},{id:'14',nombre:'Jalisco'}],municipios:[{estado:'09',nombre:'Cuauhtémoc'},{estado:'14',nombre:'Zapopan'},{estado:'14',nombre:'Guadalajara'},{estado:'14',nombre:'Guadalajara'}]};
function setup({ciudad='Ciudad anterior',estado='Ciudad de México',fallar=false}={}){
 class Option{constructor(text,value){this.textContent=text;this.value=value}}
 class Event{constructor(type){this.type=type}}
 class Field{
  constructor(){this.value='';this.hidden=true;this.listeners={};this.options=[]}
  add(o){this.options.push(o)}
  replaceChildren(...ops){this.options=ops;this.value=''}
  addEventListener(e,f){(this.listeners[e]??=[]).push(f)}
  dispatchEvent(e){(this.listeners[e.type]||[]).forEach(f=>f(e))}
  focus(){this.focused=true}
 }
 const fields=Object.fromEntries(['notaria-ubicacion','f-notario-estado','f-notario-ciudad','f-notario-ciudad-lista','f-notario-ciudad-otra-campo','f-notario-ciudad-otra','notaria-catalogo-error','notaria-catalogo-reintentar'].map(id=>[id,new Field()]));
 fields['f-notario-estado'].value=estado;fields['f-notario-ciudad'].value=ciudad;
 let iniciar,falla=fallar;
 const window={kwUI:{selects(){}},kwSelectBusqueda:{preparar(){}},kwProfecoForm:{menus(){}}};
 const scope=vm.createContext({window,Option,Event,console,document:{readyState:'loading',getElementById:id=>fields[id],addEventListener:(e,f)=>{iniciar=f}},fetch:async()=>{if(falla)throw Error('red');return{ok:true,json:async()=>datos}}});
 vm.runInContext(source,scope);return{fields,window,Event,iniciar,recuperar(){falla=false}};
}
test('ciudades por estado, sin duplicados y con búsqueda tolerante a acentos',()=>{
 const m=setup();assert.deepEqual(Array.from(m.window.kwNotariaUbicacion.ciudadesPara(datos,'jalisco')),['Guadalajara','Zapopan']);
 assert.deepEqual(Array.from(m.window.kwNotariaUbicacion.ciudadesPara(datos,'ciudad de mexico')),['Cuauhtémoc']);
 assert.deepEqual(Array.from(m.window.kwNotariaUbicacion.ciudadesPara(datos,'')),[]);
});
test('conserva ciudades anteriores, limpia al cambiar estado y permite otra localidad',async()=>{
 const m=setup();m.iniciar();await m.window.kwNotariaUbicacion.cargar();
 const f=m.fields;assert.equal(f['f-notario-ciudad'].value,'Ciudad anterior');assert.equal(f['f-notario-ciudad-lista'].value,'Ciudad anterior');
 f['f-notario-estado'].value='Jalisco';f['f-notario-estado'].dispatchEvent(new m.Event('change'));assert.equal(f['f-notario-ciudad'].value,'');
 assert.ok(f['f-notario-ciudad-lista'].options.some(o=>o.value==='Guadalajara'));assert.ok(!f['f-notario-ciudad-lista'].options.some(o=>o.value==='Cuauhtémoc'));
 f['f-notario-ciudad-lista'].value='Guadalajara';f['f-notario-ciudad-lista'].dispatchEvent(new m.Event('change'));assert.equal(f['f-notario-ciudad'].value,'Guadalajara');
 f['f-notario-ciudad-lista'].value='__kw_otra_ciudad__';f['f-notario-ciudad-lista'].dispatchEvent(new m.Event('change'));assert.equal(f['f-notario-ciudad-otra-campo'].hidden,false);
 f['f-notario-ciudad-otra'].value='Localidad particular';f['f-notario-ciudad-otra'].dispatchEvent(new m.Event('input'));assert.equal(f['f-notario-ciudad'].value,'Localidad particular');
 m.window.kwNotariaUbicacion.refrescar();assert.equal(f['f-notario-ciudad-lista'].value,'Localidad particular');assert.equal(f['f-notario-ciudad'].value,'Localidad particular');
});
test('un fallo de catálogo no pierde datos y permite reintentar',async()=>{
 const m=setup({fallar:true});m.iniciar();await m.window.kwNotariaUbicacion.cargar();assert.equal(m.fields['notaria-catalogo-error'].hidden,false);assert.equal(m.fields['f-notario-ciudad'].value,'Ciudad anterior');
 m.recuperar();await m.window.kwNotariaUbicacion.cargar();assert.equal(m.fields['notaria-catalogo-error'].hidden,true);
});
