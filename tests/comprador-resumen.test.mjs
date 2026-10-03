import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/js/comprador-resumen.js';
const c={moneda:'MXN',precio_max:7000000,municipio:'Benito Juárez',recamaras_min:3,banos_min:2,estacionamientos_min:1,superficie_min:100,tipos:['Casa'],notas:'Roof garden, Alberca'};
const p={moneda:'MXN',precio:6242506,municipio:'Benito Juárez',recamaras:2,banos:3,estacionamientos:0,m2_construccion:86};
test('desglose muestra importes y diferencias concretas sin inventar características',()=>{
 const r=globalThis.kwCompradorResumen(c,p,[{nombre:'Roof garden',cumple:true}]);
 assert.match(r[0].detalle,/757,494.*debajo/);assert.equal(r[1].detalle,'En la zona deseada');
 assert.match(r[2].detalle,/1 recámara menos/);assert.match(r[2].detalle,/1 baño más/);assert.match(r[2].detalle,/1 lugar de estacionamiento menos/);
 assert.equal(r[3].detalle,'14 m² menos de lo deseado');assert.match(r[4].detalle,/Roof garden: confirmado.*Alberca: sin confirmar/);
});
test('presupuesto superior, terreno y datos desconocidos se distinguen',()=>{
 const r=globalThis.kwCompradorResumen({...c,tipos:['Terreno'],colonias:'Nápoles'},{...p,precio:7100000,m2_terreno:140,recamaras:null},[{nombre:'Colonia',parcial:true}]);
 assert.match(r[0].detalle,/100,000.*encima/);assert.equal(r[1].detalle,'Cerca de la zona deseada');assert.match(r[2].detalle,/sin información/);assert.equal(r[3].detalle,'40 m² más de lo deseado');
 const distinto=globalThis.kwCompradorResumen(c,{...p,moneda:'USD'},[]);assert.match(distinto[0].detalle,/no confirmado/);
});
