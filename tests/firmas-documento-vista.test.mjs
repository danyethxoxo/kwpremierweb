import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {posicionesDeWeetrust,descargarPdfWeetrust} from '../supabase/functions/firmar-documento/documento-vista.ts';

const firma={type:'SIGNATURE',page:0,originalLeft:50,originalScale:1,lastScale:2,pageYv2:120,
 width:160,height:60,viewport:{width:1200,height:1600},ref:'https://production-signing-files.s3.amazonaws.com/trazo.png'};
const fijo={user:{email:'pendiente@kw.mx'},page:2,coordinates:{x:200,y:250},pageY:0,imageSize:{width:100,height:40},parentImageSize:{width:600,height:800}};

test('recupera cada trazo firmado y su posicion de pagina sin repetir el campo fijo',()=>{
 const datos={signatory:[{emailID:' ANA@KW.MX ',isSigned:1,fieldArray:[firma,{...firma,page:1,pageYv2:240},{...firma,type:'TEXT'}]}],
  staticSignPositions:[{...fijo,user:{email:'ana@kw.mx'}},fijo]};
 const posiciones=posicionesDeWeetrust(datos);
 assert.equal(posiciones.length,3);
 assert.equal(posiciones[0].correo,'ana@kw.mx');assert.equal(posiciones[0].pagina,1);
 assert.equal(posiciones[0].x,100);assert.equal(posiciones[0].y,120);assert.equal(posiciones[0].imagen,firma.ref);
 assert.equal(posiciones[1].pagina,2);assert.equal(posiciones[1].y,240);
 assert.equal(posiciones[2].correo,'pendiente@kw.mx');assert.equal(posiciones[2].y,0,'cero es una coordenada valida');
});

test('no inventa dimensiones, rechaza campos fuera de hoja y conserva las posiciones locales',()=>{
 const previa={correo:'local@kw.mx',pagina:1,x:10,y:20,ancho:30,alto:40,pagAncho:600,pagAlto:800};
 const doc={signatory:[{emailID:'ana@kw.mx',isSigned:1,fieldArray:[{...firma,viewport:{}},{...firma,page:-1},{...firma,pageYv2:1700}]}]};
 assert.deepEqual(posicionesDeWeetrust(doc,[previa]),[previa]);
 assert.deepEqual(posicionesDeWeetrust({signatory:[{emailID:'ana@kw.mx',isSigned:0,fieldArray:[firma]}]}),[]);
 const insegura=posicionesDeWeetrust({signatory:[{emailID:'ana@kw.mx',isSigned:1,fieldArray:[{...firma,ref:'javascript:alert(1)'}]}]});
 assert.equal(insegura[0].imagen,null);
});

test('descarga solo PDF del almacenamiento conocido, sin seguir redirecciones ni aceptar URLs arbitrarias',async()=>{
 let llamadas=0;
 const descargar=async(url,options)=>{llamadas++;assert.equal(options.redirect,'error');return new Response('%PDF-1.7\ncontenido');};
 const archivo=await descargarPdfWeetrust(firma.ref,descargar);
 assert.equal(new TextDecoder().decode(archivo),'%PDF-1.7\ncontenido');
 for(const url of ['http://production-signing-files.s3.amazonaws.com/a.pdf','https://127.0.0.1/a.pdf','https://production-signing-files.s3.amazonaws.com.evil.test/a.pdf','https://user:password@production-signing-files.s3.amazonaws.com/a.pdf']) {
  await assert.rejects(descargarPdfWeetrust(url,descargar));
 }
 assert.equal(llamadas,1);
 await assert.rejects(descargarPdfWeetrust(firma.ref,async()=>new Response('<html>error</html>')),/no es un PDF/);
 await assert.rejects(descargarPdfWeetrust(firma.ref,async()=>new Response('%PDF-1.7',{headers:{'content-length':String(31*1024*1024)}})),/30 MB/);
});

test('la lectura del PDF verifica permisos antes de consultar Weetrust',async()=>{
 const source=readFileSync(new URL('../supabase/functions/firmar-documento/index.ts',import.meta.url),'utf8');
 const inicio=source.indexOf("    if (accion === 'url_documento' || accion === 'archivo_documento')");
 const bloque=stripTypeScriptTypes('(async()=>{'+source.slice(inicio,source.indexOf('    // ── Quitar los renglones fantasma',inicio))+'})()');
 let consultas=0;
 const scope=vm.createContext({body:{id:'ajeno'},accion:'archivo_documento',userId:'usuario',
  admin:{from:(tabla)=>({select:()=>({eq:()=>({single:async()=>({data:tabla==='profiles'?{role:'asesor'}:{id:'ajeno',user_id:'otro',weetrust_document_id:'remoto'}})})})})},
  obtenerToken:async()=>{consultas++;return 'token';},respond:(body,status)=>({body,status})});
 const resultado=await vm.runInContext(bloque,scope);
 assert.equal(resultado.status,403);assert.equal(consultas,0);
});
