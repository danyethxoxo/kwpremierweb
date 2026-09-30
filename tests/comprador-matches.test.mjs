import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = vm.createContext({window:{}});
vm.runInContext(readFileSync(new URL('../assets/js/comprador-matches.js',import.meta.url),'utf8'),context);
const evaluar = context.window.kwCompradorMatches.evaluar;
const cliente = {operacion:'venta',tipos:['Casa'],estado:'Ciudad de México',municipio:'Benito Juárez',precio_max:7000000,moneda:'MXN',recamaras_min:3,notas:'Roof garden\nJardín'};
const propiedad = {estatus:'publicada',operacion:'venta',tipos_filtro:['Casa'],tipo:'Casa',estado:'Ciudad de México',municipio:'Benito Juárez',precio:6500000,moneda:'MXN',recamaras:3,descripcion:'Amplio ROOF GARDEN y jardín privado.'};
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
