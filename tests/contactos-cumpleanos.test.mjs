import test from 'node:test';
import assert from 'node:assert/strict';
import {fechaCumpleanos,planCumpleanos,completarCumpleanos} from '../supabase/functions/_shared/contactos-cumpleanos.ts';

test('valida cumpleaños reales y conserva día/mes sin inventar año',()=>{
 assert.deepEqual(fechaCumpleanos('29/02'),{day:29,month:2});
 assert.deepEqual(fechaCumpleanos('1980-07-19'),{day:19,month:7,year:1980});
 for(const fecha of ['29/02/2025','31/04/1980','0/12','20/13','-',''])assert.equal(fechaCumpleanos(fecha),null);
});

test('solo completa contactos existentes identificados por correo y omite fechas ambiguas',()=>{
 const personas=[{nombre:'Uno',correo:'uno@example.com',cumpleanos:'14/03/1980'},
 {nombre:'Sin fecha',correo:'dos@example.com'},
 {correo:'tres@example.com',cumpleanos:'14/03/1980'},{correo:'tres@example.com',cumpleanos:'15/03/1980'}];
 const contacto=(id,email,birthdays=[])=>({resourceName:'people/'+id,emailAddresses:[{value:email}],birthdays});
 const p=planCumpleanos(personas,[contacto('1','UNO@example.com'),contacto('2','dos@example.com'),contacto('3','tres@example.com'),contacto('4','ajeno@example.com'),contacto('5','uno@example.com',[{date:{day:3,month:1}}])]);
 assert.equal(p.pendientes.length,1);assert.equal(p.pendientes[0].contacto.resourceName,'people/1');
 assert.equal(p.sinFecha.length,1);assert.equal(p.ambiguos.length,1);assert.equal(p.yaTienen,1);assert.equal(p.ajenos,1);
});

test('actualiza solo birthdays con el etag vigente y confirma el valor devuelto por Google',async()=>{
 const previo=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,init)=>{
  calls.push({url,init});
  return Response.json(init.method==='PATCH'?{birthdays:[{date:{day:19,month:7,year:1980}}]}:
   {resourceName:'people/uno',etag:'vigente',metadata:{sources:[{type:'CONTACT',id:'uno',etag:'version'}]}});
 };
 try{
  assert.equal(await completarCumpleanos('test-token','people/uno',{day:19,month:7,year:1980}),true);
  const patch=calls[1];assert.equal(new URL(patch.url).searchParams.get('updatePersonFields'),'birthdays');
  const body=JSON.parse(patch.init.body);assert.equal(body.etag,'vigente');
  assert.deepEqual(Object.keys(body).sort(),['birthdays','etag','metadata','resourceName']);
 }finally{globalThis.fetch=previo;}
});

test('no pisa un cumpleaños existente ni reintenta una escritura rechazada',async()=>{
 const previo=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return Response.json({birthdays:[{date:{day:1,month:2}}]});};
  assert.equal(await completarCumpleanos('test-token','people/uno',{day:19,month:7}),false);assert.equal(calls,1);
  globalThis.fetch=async(url,init)=>init.method==='PATCH'?Response.json({error:'etag cambiado'},{status:400}):Response.json({metadata:{sources:[{type:'CONTACT',etag:'viejo'}]}});
  await assert.rejects(completarCumpleanos('test-token','people/uno',{day:19,month:7}),/400/);
 }finally{globalThis.fetch=previo;}
});
