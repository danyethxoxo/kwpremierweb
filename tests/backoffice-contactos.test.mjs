import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../supabase/functions/',import.meta.url);
const helper=fs.readFileSync(new URL('_shared/backoffice-contactos.ts',root),'utf8');
const edge=fs.readFileSync(new URL('hyper-processor/index.ts',root),'utf8');
const context=vm.createContext({console,Map,Set,URL,AbortSignal,JSON});
vm.runInContext(stripTypeScriptTypes(helper.replace(/^export /gm,'')),context);
const p=context.agruparBackoffice([
 {correoPersonal:'BACK@EXAMPLE.COM',asesorAsignado:'Arturo Córdoba Lavanqui'},
 {correoPersonal:'back@example.com',asesorAsignado:'Felipe Álvarez Icaza'},
 {correoPersonal:'back@example.com',asesorAsignado:'ARTURO CORDOBA LAVANQUI'},
 {correoPersonal:'',asesorAsignado:'Otro asesor'}
]);
assert.equal(p.length,2);
assert.equal(p[0].asesorAsignado,'Arturo Córdoba Lavanqui; Felipe Álvarez Icaza');
assert.equal(context.fichaBackoffice(p[0]).descripcion,'Backoffice de: Arturo Córdoba Lavanqui, Felipe Álvarez Icaza');
assert.equal(context.esBackoffice('back_office_activo'),true);
assert.equal(context.esBackoffice('asesor_activo'),false);
context.ALTA_SHEET_RANGO='A:Z';
vm.runInContext(stripTypeScriptTypes(edge.slice(edge.indexOf('function limpiarCorreo('),edge.indexOf('// La hoja de los asesores activos es la que manda'))),context);
const parsed=context.parsearPersonas([
 ['Nombre BackOffice','Asesor responsable','Mail Personal'],
 ['Juan','Arturo Córdoba Lavanqui','back@example.com'],
 ['Juan','Felipe Álvarez Icaza','back@example.com']
]);
assert.equal(parsed.length,1);
assert.equal(parsed[0].asesorAsignado,'Arturo Córdoba Lavanqui; Felipe Álvarez Icaza');
assert.equal(context.parsearPersonas([['Agente','Correo KW'],['Asesor','a@example.com'],['Asesor','a@example.com']]).length,2);
let reads=0,writes=0,body,mask;
let actual={etag:'e1',metadata:{sources:[{type:'CONTACT',id:'1',etag:'e1'}]},organizations:[{name:'KW PREMIER',title:'Asesor Inmobiliario',department:'Conservar'},{name:'Otra empresa',title:'Gerente'}],biographies:[{value:'Nota que debe conservarse\nBackoffice de: Anterior',contentType:'TEXT_PLAIN'}]};
context.fetch=async(url,options={})=>{
 if(options.method==='PATCH'){
   writes++;body=JSON.parse(options.body);mask=url;
   assert.equal(body.metadata.sources[0].etag,'e1');
   actual={...actual,...body};
 }else reads++;
 return {ok:true,json:async()=>actual};
};
assert.equal(await context.actualizarFichaBackoffice('test','people/123',p[0]),true);
assert.equal(writes,1);assert.equal(body.organizations[0].title,'Backoffice');
assert.equal(body.organizations[0].department,'Conservar');
assert.equal(body.organizations[1].name,'Otra empresa');
assert.equal(body.biographies[0].value,'Nota que debe conservarse\nBackoffice de: Arturo Córdoba Lavanqui, Felipe Álvarez Icaza');
assert.ok(mask.includes('updatePersonFields=organizations,biographies'));
assert.equal(body.phoneNumbers,undefined);assert.equal(body.birthdays,undefined);assert.equal(body.names,undefined);
assert.equal(await context.actualizarFichaBackoffice('test','people/123',p[0]),false);
assert.equal(writes,1);assert.equal(reads,2);
await assert.rejects(context.actualizarFichaBackoffice('test','https://malicioso.invalid',p[0]),/no válido/);
context.fetch=async()=>({ok:false,status:400});
await assert.rejects(context.actualizarFichaBackoffice('test','people/123',p[0]),/400/);
// Compilar todos los scripts afectados sin ejecutar la aplicación.
new vm.Script(stripTypeScriptTypes(edge.replace(/^import[^\r\n]*\r?\n/gm,'')));
for(const path of ['hub/admin.html','hub/base-asesores.html']){
 const html=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
 for(const match of html.matchAll(/<script\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/script>/gi))if(match[1].trim())new vm.Script(match[1]);
}
console.log('PASS: responsables múltiples, lectura del Excel, cargo, conservación de notas y otros datos, idempotencia, errores y sintaxis.');

