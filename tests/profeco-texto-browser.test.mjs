import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const sdk=fs.readFileSync(path.join(root,'tests/contrato-comercial-browser.test.mjs'),'utf8').split('const sdk=`')[1].split('`;')[0];
const out=path.join(root,'artifacts/profeco-texto');fs.mkdirSync(out,{recursive:true});

test('PROFECO: texto completo, concordancia y firmas de uno a nueve clientes; PDF real',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try {
  const ctx=await browser.newContext({viewport:{width:1440,height:1100}});
  await ctx.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.pathname.endsWith('/auth-guard.js'))return route.fulfill({body:sdk,contentType:'application/javascript'});
   if(u.hostname!=='kw.local'||u.pathname.endsWith('/kw-session.js'))return route.fulfill({body:''});
   const file=path.join(root,decodeURIComponent(u.pathname));
   return route.fulfill({status:fs.existsSync(file)?200:404,body:fs.existsSync(file)?fs.readFileSync(file):'',contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
  });
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://kw.local/documentos/contratos/profeco.html?nuevo=1');await page.waitForSelector('.kw-contrato-hoja');
  await page.addScriptTag({url:'https://kw.local/assets/vendor/jspdf/jspdf-4.2.1.umd.min.js'});
  await page.evaluate(()=>{
   const Original=jspdf.jsPDF;window.qaPdfScales=[];
   jspdf.jsPDF=function(...args){
    const pdf=new Original(...args),text=pdf.text;
    pdf.text=function(...args){if(args[3]?.horizontalScale)qaPdfScales.push(args[3].horizontalScale);return text.apply(this,args);};
    return pdf;
   };
  });
  const reports=[];
  for(const count of [1,2,3,4,5,6,7,8,9]) {
   const result=await page.evaluate(count=>{
    const input=(id,value)=>{document.getElementById(id).value=value;};
    limpiarFormulario();input('f-num-clientes',String(count));renderClientesFields();
    const nombres=['Alberto Prueba Uno','Beatriz Prueba Dos','Carlos Prueba Tres','Diana Prueba Cuatro','Elena Prueba Cinco','Fernando Prueba Seis','Gabriela Prueba Siete','Hector Prueba Ocho','Isabel Prueba Nueve'].slice(0,count);
    for(let i=0;i<count;i++) {
     const cli={nombre:nombres[i],rfc:'PRUEBA123456',curp:'PRUEBA123456789012',idtipo:i%2?'PASAPORTE':'INE',identidad:i%2?'Secretaría de Relaciones Exteriores (SRE)':'Instituto Nacional Electoral',idnum:'IDMEX1234567',domicilio:'San Francisco 25',tel:'5512345678',correo:'prueba@example.com',civil:'SOLTERO(A)'};
     for(const [key,value] of Object.entries(cli))input('f-cli'+i+'-'+key,value);
    }
    for(const [id,value] of Object.entries({'f-inm-direccion':'San Francisco 25','f-inm-alcaldia':'Benito Juárez','f-inm-escritura':'4','f-inm-escritura-fecha':'2024-04-04','f-inm-notario':'Notario de prueba','f-inm-notario-num':'4','f-inm-notario-ciudad':'Ciudad de Mexico','f-inm-folio':'FOLIO-PRUEBA','f-agente':'Asesor de Prueba','f-agente-wa':'5513132323','f-agente-correo':'asesor@example.com','f-con-fecha':'2026-10-27','f-con-vig-inicio':'2026-10-27','f-con-vig-fin':'2027-04-26','f-con-precio':'1000000','f-con-pena':'10'}))input(id,value);
    document.querySelectorAll('#acuerdos-form-col select').forEach(el=>{if(Array.from(el.options).some(op=>op.value==='SI'))el.value='SI';});
    kwProfecoForm.refrescar();updatePreview();kwContratoDocumento.render(configuracionDocumento());
    const raw=document.getElementById('contrato-raw'), all=raw.textContent.replace(/\s+/g,' ').trim();
    const children=Array.from(raw.children), section=(start,end)=>{
     const a=children.findIndex(el=>el.matches(start)),b=end?children.findIndex((el,i)=>i>a&&el.matches(end)):children.length;
     return children.slice(a,b).map(el=>el.textContent).join(' ').replace(/\s+/g,' ');
    };
    const firmas=Array.from(raw.querySelectorAll('[data-profeco-firmas]'),el=>({tipo:el.dataset.profecoFirmas,nombres:Array.from(el.querySelectorAll('.doc-firma-col')).slice(0,count).map(el=>el.textContent)}));
    const pages=Array.from(document.querySelectorAll('#contrato-preview .kw-contrato-hoja'),hoja=>{
     const r=hoja.getBoundingClientRect(),scale=r.width/816,cuerpo=hoja.querySelector('.kw-contrato-cuerpo');
     return {texto:hoja.textContent,bottom:(cuerpo.getBoundingClientRect().bottom-r.top)/scale,overflow:cuerpo.scrollWidth>cuerpo.clientWidth+1};
    });
    return {nombres,all,header:raw.querySelector('.doc-intro').textContent,declaraciones:section('.doc-seccion','.doc-seccion'),a:section('[data-profeco-seccion="a1"]','[data-profeco-seccion="b1"]'),b:section('[data-profeco-seccion="b1"]','[data-profeco-seccion="c"]'),c:section('[data-profeco-seccion="c"]'),firmas,pages};
   },count);
   assert.ok(result.header.includes('POR LA OTRA PARTE Alberto'));
   for(const [texto,re] of [['Declaración',/Declara el Cliente/],['Propiedad',/Es legítimo propietario/],['Denominación',count===1?/A QUIEN EN LO SUCESIVO SE LE DENOMINARÁ/:/A QUIENES EN LO SUCESIVO SE LES DENOMINARÁ CONJUNTAMENTE/]])assert.match(result.all,re,texto);
   assert.equal((result.declaraciones.match(/II\. Declara el Cliente/g)||[]).length,count);
   for(const frase of ['a. Es una persona física mayor de edad','b. Es legítimo propietario','c. Pone a disposición del Intermediario','d. El Inmueble','e. El Inmueble'])assert.equal(result.declaraciones.split(frase).length-1,count,frase);
   assert.doesNotMatch(result.declaraciones,/Declaran los Clientes|Son legítimos propietarios|Ponen a disposición/);
   for(const nombre of result.nombres)for(const key of ['header','declaraciones','a','b','c'])assert.ok(result[key].includes(nombre),count+' '+key+' '+nombre);
   assert.equal(result.firmas.length,4);
   for(const firma of result.firmas){assert.equal(firma.nombres.length,count);for(const nombre of result.nombres)assert.equal(firma.nombres.filter(text=>text.includes(nombre)).length,1,firma.tipo+' '+nombre);}
   assert.match(result.all,/expedida por el Instituto Nacional Electoral/);
   assert.match(result.all,/4 \(CUATRO\), de fecha/);
   assert.match(result.all,/OCTAVA\. Derechos de las Partes\. El Cliente/);
   assert.match(result.all,/ubicado en San Francisco/);assert.match(result.c,/WhatsApp 5513132323/);
   assert.match(result.all,/de la Ciudad de México/);assert.doesNotMatch(result.all,/de la ciudad de Ciudad/);
   for(const mal of [/Esn/,/Declaran el Clientes/,/la Intermediaria/,/en el entendido que/,/sus derechos acceso/,/obligaciones derivadas/,/contractual suscritas/,/serán consideradas/,/cada una y toda/,/de acuerdo que/,/y, conocer/,/titular, que sus datos personales,/,/condiciones de Aviso/,/\bSI\b/])assert.doesNotMatch(result.all,mal);
   assert.match(result.all,/El Inmueble SÍ está sujeto/);
   assert.match(result.all,count>1?/ENTERADOS Y CONFORMES/:/ENTERADO Y CONFORME/);
   assert.match(result.all,count>1?/NOMBRES Y FIRMAS DE LOS CLIENTES/:/NOMBRE Y FIRMA DEL CLIENTE/);
   for(const palabra of count>1?['Estimados','ustedes','les informamos','brindarles','ofrecerles','pueden comunicarse','les enviamos']:['Estimado','usted','le informamos','brindarle','ofrecerle','puede comunicarse','le enviamos'])assert.ok(result.c.includes(palabra),palabra);
   assert.ok(result.pages.every(p=>p.bottom<=991&&!p.overflow),'Sin cortes ni desbordamiento: '+count);
   if([1,3,9].includes(count)){
    await page.evaluate(()=>{qaPdfScales=[];});
    const download=page.waitForEvent('download');await page.evaluate(()=>downloadPDF());await (await download).saveAs(path.join(out,'profeco-'+count+'-clientes.pdf'));
    const scales=await page.evaluate(()=>qaPdfScales);
    assert.ok(scales.length>1000);assert.ok(scales.every(scale=>scale>.5&&scale<1.5),'El texto no se estira al partir telefonos o identificadores entre lineas');
   }
   reports.push({clientes:count,...result});
  }
  fs.writeFileSync(path.join(out,'textos.json'),JSON.stringify(reports,null,2));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
