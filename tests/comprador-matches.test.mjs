import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = vm.createContext({window:{}});
vm.runInContext(readFileSync(new URL('../assets/js/comprador-matches.js',import.meta.url),'utf8'),context);
const evaluar = context.window.kwCompradorMatches.evaluar;
const cliente = {operacion:'venta',tipos:['Casa'],estado:'Ciudad de México',municipio:'Benito Juárez',precio_max:7000000,moneda:'MXN',recamaras_min:3,notas:'Roof garden\nJardín'};
const propiedad = {estatus:'publicada',operacion:'venta',tipos_filtro:['Casa'],tipo:'Casa',estado:'Ciudad de México',municipio:'Benito Juárez',precio:6500000,moneda:'MXN',recamaras:3,descripcion:'Amplio ROOF GARDEN y jardín privado.'};
test('presupuesto ponderado 40 puntos y descuento proporcional hasta el 16%',()=>{
  for (const [exceso,esperado] of [[0,40],[.01,37.5],[.02,35],[.10,15],[.16,0],[.2,0]]) {
    const resultado = evaluar(cliente,{...propiedad,precio:cliente.precio_max*(1+exceso)});
    assert.equal(resultado.criterios.find(c=>c.nombre==='Presupuesto').aporte,esperado);
  }
});
test('precio inferior al mínimo no se penaliza y los requisitos libres suman',()=>{
  const resultado = evaluar({...cliente,precio_min:6000000,recamaras_min:null,municipio:'',notas:''},{...propiedad,precio:5000000,recamaras:null});
  assert.equal(resultado.porcentaje,100);
  assert.equal(resultado.criterios.reduce((s,c)=>s+c.peso,0),100);
});
test('ubicación exacta da 10 y 20 puntos; cercanía no se supone sin coordenadas',()=>{
  const c = {...cliente,colonias:'Del Valle Norte'};
  const exacto = evaluar(c,{...propiedad,colonia:'Del Valle Norte'});
  assert.equal(exacto.criterios.find(r=>r.nombre==='Colonia').aporte,20);
  const otra = evaluar(c,{...propiedad,colonia:'Otra colonia'});
  assert.equal(otra.criterios.find(r=>r.nombre==='Colonia').aporte,0);
});
test('coincidencia completa y etiquetas ignoran acentos y mayúsculas',()=>assert.equal(evaluar(cliente,propiedad).porcentaje,100));
test('no ofrece inmuebles suspendidos, de otra operación, tipo, ciudad o moneda',()=>{
  for (const cambio of [{estatus:'suspendida'},{operacion:'renta'},{tipos_filtro:['Terreno']},{estado:'Jalisco'},{moneda:'USD'}]) assert.equal(evaluar(cliente,{...propiedad,...cambio}),null);
});
test('faltantes y negaciones no cuentan como características cumplidas',()=>{
  const resultado = evaluar(cliente,{...propiedad,recamaras:null,descripcion:'Sin jardín. No cuenta con roof garden.'});
  assert(resultado.porcentaje<100);
  for (const criterio of resultado.criterios.filter(c=>['Jardín','Roof garden','Recámaras'].includes(c.nombre))) assert.equal(criterio.cumple,false);
});
test('no confunde palabras parciales y explica presupuesto cercano',()=>{
  const resultado = evaluar({...cliente,notas:'Jardín'},{...propiedad,precio:7350000,descripcion:'Jardinería cercana.'});
  assert.equal(resultado.criterios.find(c=>c.nombre==='Jardín').cumple,false);
  assert.equal(resultado.criterios.find(c=>c.nombre==='Presupuesto').parcial,true);
});
