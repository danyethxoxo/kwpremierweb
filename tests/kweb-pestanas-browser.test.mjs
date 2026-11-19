import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import sharp from 'sharp';
const script=fs.readFileSync(new URL('../assets/js/kw-security.js',import.meta.url),'utf8');

test('favicon del globo y títulos simples, también al cambiar el título después de cargar',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  for(const host of ['kweb.com.mx','www.kwpremieroficial.com']){
   const page=await browser.newPage();const errores=[];page.on('pageerror',e=>errores.push(e.message));
   await page.route('**/*',r=>{
    const p=new URL(r.request().url()).pathname;
    if(p==='/qa-tabs.html')return r.fulfill({contentType:'text/html',body:'<html><head><title>Propiedades - KW PREMIER</title><link rel="icon" href="/anterior.svg"></head><body><h1>Prueba</h1></body></html>'});
    if(p==='/assets/img/kweb-favicon.png')return r.fulfill({contentType:'image/png',body:fs.readFileSync(new URL('../assets/img/kweb-favicon.png',import.meta.url))});
    return r.fulfill({status:404,body:''});
   });
   await page.goto('https://'+host+'/qa-tabs.html');await page.addScriptTag({content:script});
   if(host==='kweb.com.mx'){
    await page.waitForFunction(()=>document.title==='Propiedades');
    assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'),'/assets/img/kweb-favicon.png');
    assert.equal(await page.locator('link[rel="icon"]').getAttribute('type'),'image/png');
    for(const [entrada,salida] of [['KW Premier','KWEB'],['Perfil comprador · KW Premier','Perfil comprador'],['Firmas Digitales · KWEB','Firmas digitales'],['KWEB - Dictámenes','Dictámenes'],['Propiedades · KW Premier · KWEB','Propiedades']]){
     await page.evaluate(t=>{document.title=t;},entrada);
     await page.waitForFunction(t=>document.title===t,salida);
    }
   }else assert.equal(await page.title(),'Propiedades - KW PREMIER');
   assert.deepEqual(errores,[]);await page.close();
  }
 }finally{await browser.close();}
 const meta=await sharp(fs.readFileSync(new URL('../assets/img/kweb-favicon.png',import.meta.url))).metadata();
 assert.equal(meta.width,64);assert.equal(meta.height,64);
});
