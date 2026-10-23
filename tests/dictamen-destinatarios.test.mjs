import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../supabase/functions/enviar-dictamen-email/index.ts',import.meta.url),'utf8');
const block=source.slice(source.indexOf('    const modo ='),source.indexOf('    const direccion')).replace('let asesorAsignado: { nombre: string; correo: string } | null','let asesorAsignado');
async function recipients(body,email='session@example.com',advisor='advisor@example.com'){
  return vm.runInNewContext('(async()=>{'+block+';return {destinatarios};})()',{
    body,identity:{user:{email}},dictamen:{asesor_id:'1'},req:{},
    EMAIL_RE:/^[^\s@]+@[^\s@]+\.[^\s@]+$/,RECIPIENTES_MANUALES:['fernanda.pacheco@kwmexico.mx','alberto.velazquez@kwpremier.com.mx'],
    response:(_req,body,status)=>({body,status}),
    admin:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{nombre:'Asesor',correo:advisor}})})})})}
  });
}
test('cada opcion envia exclusivamente a sus destinatarios',async()=>{
  for(const [mode,expected] of Object.entries({asesor:['advisor@example.com'],mca:['fernanda.pacheco@kwmexico.mx'],mcaa:['alberto.velazquez@kwpremier.com.mx'],todos:['advisor@example.com','fernanda.pacheco@kwmexico.mx','alberto.velazquez@kwpremier.com.mx'],yo:['session@example.com'],otro:['other@example.com']})){
    const result=await recipients({destinatario:mode,correo:'other@example.com'});
    assert.deepEqual(Array.from(result.destinatarios),expected);
  }
});
test('correo de sesion no acepta suplantacion desde el cliente',async()=>{
  assert.deepEqual(Array.from((await recipients({destinatario:'yo',correo:'spoof@example.com'})).destinatarios),['session@example.com']);
});
test('solo exige correo del asesor cuando participa en el envio',async()=>{
  assert.equal((await recipients({destinatario:'todos'},undefined,'')).status,400);
  assert.equal((await recipients({destinatario:'asesor'},undefined,'')).status,400);
  assert.equal((await recipients({destinatario:'mca'},undefined,'')).destinatarios.length,1);
});
test('rechaza opciones desconocidas y correos invalidos',async()=>{
  for(const body of [{destinatario:'incorrecto'},{destinatario:'otro',correo:'bad'},{destinatario:'otro',correo:'a@example.com\r\nBcc:b@example.com'}]) assert.equal((await recipients(body)).status,400);
});
