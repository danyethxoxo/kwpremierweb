import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const root=new URL('../',import.meta.url);
test('PDF loads only on export, shares the request and retries after a network error',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  const page=await browser.newPage();let requests=0,fail=false;
  await page.route('**/jspdf-4.2.1.umd.min.js*',route=>{
   requests++;
   return fail?route.abort():route.fulfill({contentType:'application/javascript',body:readFileSync(new URL('assets/vendor/jspdf/jspdf-4.2.1.umd.min.js',root))});
  });
  async function prepare(){
   await page.goto('about:blank');
   await page.setContent('<base href="https://kw.local/"><div class="print-page" style="width:664px"><p>Contrato QA</p></div>');
   await page.addScriptTag({content:readFileSync(new URL('assets/js/kw-pdf-vector.js',root),'utf8')});
  }
  await prepare();assert.equal(requests,0);
  const pdfs=await page.evaluate(async()=>Promise.all((await Promise.all([kwPDFVector.generar(document),kwPDFVector.generar(document)])).map(async b=>({size:b.size,prefix:(await b.text()).slice(0,5)}))));
  assert.equal(requests,1);for(const pdf of pdfs){assert.ok(pdf.size>500);assert.equal(pdf.prefix,'%PDF-');}
  await prepare();fail=true;
  assert.equal(await page.evaluate(()=>kwPDFVector.generar(document).then(()=>false,()=>true)),true);
  fail=false;assert.ok(await page.evaluate(async()=>(await kwPDFVector.generar(document)).size)>500);
  assert.equal(requests,3);
 }finally{await browser.close();}
});
