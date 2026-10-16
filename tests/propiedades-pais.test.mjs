import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const source=readFileSync(new URL('../supabase/functions/sincronizar-propiedades/index.ts',import.meta.url),'utf8');
function normalizar(listado,detalle=null){
 const end=source.indexOf('\nasync function ',source.indexOf('function normalizarKwMexico('));
 const code=source.slice(source.indexOf('function kwTexto('),end);
 const ctx=vm.createContext({KWMEXICO_ALL_MARKET_CENTERS:true,Map});
 vm.runInContext(stripTypeScriptTypes(code),ctx);
 return ctx.normalizarKwMexico(listado,detalle,new Map());
}
test('imports country from the property, preserves international coordinates and does not infer from its title',()=>{
 const co=normalizar({ID:401196,Country:'COL',Latitude:6.1727602,Longitude:-75.3701829});
 assert.equal(co.pais,'CO');assert.equal(co.lat,6.1727602);assert.equal(co.lng,-75.3701829);
 for(const Country of ['MX','MEX','Mexico','M\u00e9xico',null,''])assert.equal(normalizar({ID:1,Country,Title:'Carretera Colombia'}).pais,'MX');
 assert.equal(normalizar({ID:2,Country:'USA'}).pais,'US');
 assert.equal(normalizar({ID:3,Country:'GTM'}).pais,'GTM');
 assert.equal(normalizar({ID:4,Country:null},{data:{Property_Data:[{Country:'COL'}]}}).pais,'CO');
});
test('repair restores Colombia pins and remains idempotent while Mexican validations stay active',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
 create table propiedades(id int primary key,fuente text,pais text,estado text,lat numeric,lng numeric,datos_origen jsonb);
 insert into propiedades values
 (1,'kwmexico','MX','Antioquia',null,null,'{"listado":{"Country":"COL","Latitude":6.1727602,"Longitude":-75.3701829}}'),
 (2,'kwmexico','MX','Nuevo Leon',25.8,-100.29,'{"listado":{"Country":"MEX","Latitude":25.8,"Longitude":-100.29,"Title":"Carretera Colombia"}}'),
 (3,'kwmexico','MX','Valle del Cauca',null,null,'{"listado":{"Country":"COL","Latitude":3.4116503,"Longitude":-76.542324}}'),
 (4,'kwmexico','MX','Antioquia',null,null,'{"listado":{"Country":"COL","Latitude":"invalid","Longitude":""}}');`);
 for(const file of ['20261015154831_validar_coordenadas_propiedades_mexico.sql','20261015161800_validar_coordenadas_por_estado.sql','20261016175135_respetar_pais_propiedades_internacionales.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const sql=readFileSync(new URL('../supabase/migrations/20261016175135_respetar_pais_propiedades_internacionales.sql',import.meta.url),'utf8');await db.exec(sql);
 const rows=(await db.query('select id,pais,lat::float8 lat,lng::float8 lng from propiedades order by id')).rows;
 assert.deepEqual(rows,[{id:1,pais:'CO',lat:6.1727602,lng:-75.3701829},{id:2,pais:'MX',lat:25.8,lng:-100.29},{id:3,pais:'CO',lat:3.4116503,lng:-76.542324},{id:4,pais:'CO',lat:null,lng:null}]);
 await db.exec("update propiedades set lat=6.1727602,lng=-75.3701829 where id=1;update propiedades set lat=6.17,lng=-75.37 where id=2;");
 assert.equal((await db.query('select lat from propiedades where id=2')).rows[0].lat,null);
 assert.equal((await db.query('select lat::float8 lat from propiedades where id=1')).rows[0].lat,6.1727602);
 }finally{await db.close();}
});
