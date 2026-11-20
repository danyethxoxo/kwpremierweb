import test from 'node:test';
import assert from 'node:assert/strict';
import {probarConcurrencia} from '../herramientas/probar-concurrencia.mjs';

test('la prueba alcanza 200 peticiones simultaneas, consume las respuestas y no publica credenciales',async()=>{
 let activas=0,maximo=0;
 const result=await probarConcurrencia({api:'https://staging.supabase.co',niveles:[5,200]}, {pausa:async()=>{},fetchImpl:async()=>{
  activas++;maximo=Math.max(maximo,activas);await new Promise(r=>setTimeout(r,2));activas--;
  return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'https://kweb.com.mx'}});
 }});
 assert.equal(maximo,200);assert.equal(result.aprobado,true);assert.equal(result.niveles[1].solicitudes,400);
 assert.match(result.alcance,/no mide consultas autenticadas/);
});
test('se detiene si hay errores o rechazo CORS y no prueba datos reales sin habilitarlo',async()=>{
 let llamadas=0;
 const r=await probarConcurrencia({api:'https://staging.supabase.co',niveles:[5,200]}, {pausa:async()=>{},fetchImpl:async()=>{llamadas++;return new Response(null,{status:503});}});
 assert.equal(r.aprobado,false);assert.equal(r.detenidoEn,5);assert.equal(llamadas,10);
 await assert.rejects(()=>probarConcurrencia({api:'https://iloetojomzqtadkithtv.supabase.co',modo:'inventario'}),/staging/);
 await assert.rejects(()=>probarConcurrencia({api:'https://staging.supabase.co',modo:'sesion',niveles:[200]}),/sesion de prueba por participante/);
});

test('una ronda de 200 no emite una segunda ola y conserva errores HTTP no JSON',async()=>{
 let llamadas=0;
 const r=await probarConcurrencia({api:'https://staging.supabase.co',niveles:[200],repeticionesPorNivel:1},{pausa:async()=>{},fetchImpl:async()=>{
  llamadas++;return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'https://kweb.com.mx'}});
 }});
 assert.equal(llamadas,200);assert.equal(r.niveles[0].solicitudes,200);
 const token='header.'+Buffer.from(JSON.stringify({iss:'https://staging.supabase.co/auth/v1'})).toString('base64url')+'.fixture';
 const bad=await probarConcurrencia({api:'https://staging.supabase.co',modo:'inventario',niveles:[1],sesiones:[{token}]},{pausa:async()=>{},fetchImpl:async()=>new Response('<html>limit</html>',{status:429})});
 assert.equal(bad.niveles[0].estados[429],2);
});
