import fs from 'node:fs';
import vm from 'node:vm';

export const html=fs.readFileSync(new URL('../../hub/dictamenes.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
function funcion(nombre){
  const start=html.search(new RegExp('^  (?:async )?function '+nombre+'\\(','m'));
  if(start<0)throw new Error('Función no encontrada: '+nombre);
  const finLinea=html.indexOf('\n',start);
  if(html.slice(start,finLinea).trim().endsWith('}'))return html.slice(start,finLinea);
  return html.slice(start,html.indexOf('\n  }',start)+4);
}
function variable(nombre){
  const start=html.indexOf('  var '+nombre+' =');
  if(start<0)throw new Error('Variable no encontrada: '+nombre);
  return html.slice(start,html.indexOf(';',start)+1);
}
export const pdfScript=['ESTADOS','OPERACIONES','USOS','CONTRATOS','MARCA_CORRECCIONES'].map(variable).join('\n')+'\n'+
  ['fecha','respuestaCfdi','siNo','soloCifra','soloNumero','conPesos','conPorciento','conUnidad',
    'separarCorrecciones','correccionDe','tieneEscrituraDesglosada'].map(funcion).join('\n')+'\n'+
  html.slice(html.indexOf('  var HOJA_ROJO ='),html.indexOf('  function base64DeBlob('));
export function runtime(datos={},script=pdfScript){
  const ctx=vm.createContext({Blob,Uint8Array,Date,Number,URL,
    clientes:datos.clientes||[],puntos:datos.puntos||[],dictamenes:datos.dictamen?[datos.dictamen]:[]});
  vm.runInContext(script,ctx);
  ctx.cargarLogo=async()=>null;
  return ctx;
}
