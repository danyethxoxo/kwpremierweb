import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const raiz=new URL('../',import.meta.url);

test('la ubicación identifica CDMX o su municipio real sin servicios externos ni aproximar el más cercano',async()=>{
 const lecturas=[];
 const scope=vm.createContext({window:{},AbortSignal,fetch:async url=>{lecturas.push(url);return {ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL('.'+url,raiz),'utf8'))};}});
 vm.runInContext(fs.readFileSync(new URL('assets/js/propiedades-geografia.js',raiz),'utf8'),scope);
 const ciudad=scope.window.kwGeografiaMapa.porCoordenadas;
 assert.equal((await ciudad(19.369,-99.163)).estado[0],'Ciudad de México');
 assert.equal((await ciudad(19.369,-99.163)).municipio,null,'CDMX incluye sus alcaldías');
 assert.equal((await ciudad(20.676,-103.35)).municipio[0],'Guadalajara');
 assert.equal((await ciudad(25.68,-100.31)).municipio[0],'Monterrey');
 assert.equal(await ciudad(40.4,-3.7),null);
 assert.equal(await ciudad(NaN,0),null);
 assert.ok(lecturas.every(url=>url.startsWith('/assets/data/limites-mx/')));
});
test('contornos INEGI: reconoce estados, alcaldias y nombres repetidos sin elegir una ubicacion arbitraria',async()=>{
 const lecturas=[];
 const scope=vm.createContext({window:{},AbortSignal,fetch:async url=>{lecturas.push(url);return {ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL('.'+url,raiz),'utf8'))};}});
 vm.runInContext(fs.readFileSync(new URL('assets/js/propiedades-geografia.js',raiz),'utf8'),scope);
 const resolver=scope.window.kwGeografiaMapa.resolver;
 const mich=await resolver({texto:'michoacan'});
 assert.equal(mich.features.length,1);assert.equal(mich.features[0].properties.cvegeo,'16');
 const filtros=await scope.window.kwGeografiaMapa.prepararFiltros({texto:'michoacan',operacion:['renta']});
 assert.equal(filtros.texto,'');assert.deepEqual(Array.from(filtros.estado),['Michoacán de Ocampo','Michoacán']);assert.equal(filtros.operacion[0],'renta');
 const benito=await resolver({estado:['CDMX'],municipio:['Benito Juárez']});
 assert.equal(benito.features.length,1);assert.equal(benito.features[0].properties.cvegeo,'09014');
 const repetido=await resolver({texto:'Benito Juarez'});assert.equal(repetido.features.length,0);assert.equal(repetido.ambiguo,true);
 const dos=await resolver({estado:['Jalisco','Michoacán de Ocampo']});assert.equal(dos.features.length,2);
 assert.equal((await resolver({texto:'renta alberca'})).features.length,0);
 assert.equal(lecturas.filter(x=>x.endsWith('/indice.json')).length,1);
 assert.equal(lecturas.filter(x=>x.endsWith('/09.geojson')).length,1);
 assert.equal(lecturas.some(x=>x.endsWith('/16.geojson')),false,'no descarga todos los municipios para mostrar un estado');
});
