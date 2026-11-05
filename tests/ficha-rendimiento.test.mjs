import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chromium} from 'playwright';
import {instalarVectorFicha} from './helpers/ficha-vector-fixture.mjs';
const source=fs.readFileSync(new URL('../assets/js/kw-ficha-propiedad.js',import.meta.url),'utf8');

test('comparte imágenes en curso, conserva las exitosas y reintenta después de un bloqueo',async()=>{
 const imagenes=[], timers=new Map();let siguiente=0;
 class Imagen {set src(url){this.url=url;if(url)imagenes.push(this);}}
 const contexto=vm.createContext({Image:Imagen,Promise,Map,URL,
  window:{location:{href:'https://ficha.example/',origin:'https://ficha.example'}},
  candidatosImagen:url=>[url,url+'-respaldo'],
  setTimeout:fn=>{timers.set(++siguiente,fn);return siguiente;},clearTimeout:id=>timers.delete(id)});
 const inicio=source.indexOf('  var imagenesFicha =');
 vm.runInContext(source.slice(inicio,source.indexOf('  function cargarFotosDisponibles',inicio)),contexto);
 const a=contexto.cargarImagen('foto'),b=contexto.cargarImagen('foto');
 assert.equal(a,b);assert.equal(imagenes.length,1);
 imagenes[0].onload();const imagen=await a;
 assert.equal(await contexto.cargarImagen('foto'),imagen);assert.equal(timers.size,0);
 const bloqueada=contexto.cargarImagen('bloqueada');
 [...timers.values()][0]();await new Promise(ok=>setImmediate(ok));
 assert.equal(imagenes.at(-1).url,'bloqueada-respaldo');
 [...timers.values()][0]();assert.equal(await bloqueada,null);
 const nueva=contexto.cargarImagen('bloqueada');
 assert.equal(imagenes.at(-1).url,'bloqueada');
 imagenes.at(-1).onload();await nueva;
});

test('Detalle inicia el mapa mientras las fotos están pendientes y reutiliza la galería al reabrir',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try {
  const page=await browser.newPage();const pendientes=[];let fotos=0;
  await page.route('https://ficha.example/**',async r=>{
   const p=new URL(r.request().url()).pathname;
   if(p==='/')return r.fulfill({contentType:'text/html',body:'<html><body></body></html>'});
   if(p.startsWith('/assets/'))return r.fulfill({contentType:'image/png',body:fs.readFileSync(new URL('..'+p,import.meta.url))});
   fotos++;await new Promise(ok=>pendientes.push(ok));
   await r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#e8e2d7"/></svg>'});
  });
  await page.goto('https://ficha.example/');await instalarVectorFicha(page);
  await page.addScriptTag({path:'assets/vendor/fichas/vector.js'});
  await page.evaluate(()=>{const original=kwFichaVector;window.kwFichaVector={...original,cargarMapa:c=>{window.mapaIniciado=true;return original.cargarMapa(c);}};});
  await page.addScriptTag({content:source});
  await page.evaluate(()=>{
   window.opciones={plantilla:'expediente',propiedad:{titulo:'Departamento en venta',lat:19.391,lng:-99.162,imagenes:['https://ficha.example/foto-1','https://ficha.example/foto-2']},asesor:{nombre:'Daniel Guerrero'}};
   window.abriendo=kwFichaPropiedad.abrir(opciones);
  });
  await page.waitForFunction(()=>window.mapaIniciado);
  await page.waitForFunction(()=>document.querySelector('.kw-ficha-boton-pdf').disabled);
  while(pendientes.length<2)await new Promise(ok=>setTimeout(ok,10));
  pendientes.forEach(ok=>ok());await page.evaluate(()=>window.abriendo);
  assert.equal(await page.locator('.kw-ficha-canvas').count(),2);
  const solicitudes=fotos;
  await page.locator('.kw-ficha-cerrar').click();
  await page.evaluate(()=>kwFichaPropiedad.abrir(opciones));
  assert.equal(fotos,solicitudes);
  assert.equal(await page.locator('.kw-ficha-boton-pdf').isDisabled(),false);
 }finally{await browser.close();}
});
