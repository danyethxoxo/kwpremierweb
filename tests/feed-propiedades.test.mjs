import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
const source = fs.readFileSync(new URL('../supabase/functions/recibir-feed-propiedades/core.ts',import.meta.url),'utf8');
const context = vm.createContext({ XMLParser, XMLValidator, URL, Date, crypto, TextEncoder });
vm.runInContext(stripTypeScriptTypes(source.replace(/^import[^\n]+\n/,''),{mode:'transform'}).replaceAll('export ', '')+'\nglobalThis.parseFeed=parseFeed;',context);
const parse = context.parseFeed;
const property = {id:'PRUEBA-1',titulo:'Casa de prueba',estatus:'activa',operacion:'venta',tipo:'Casa',precio:4500000,moneda:'MXN',estado:'Ciudad de México',municipio:'Benito Juárez',imagenes:['https://example.com/foto.jpg'],asesor_email:'prueba@example.com'};
const feed = () => ({version:1,envio_id:'prueba-1',generado_at:'2026-11-11T10:00:00Z',modo:'incremental',total:1,propiedades:[structuredClone(property)]});
test('valida JSON con precio, asesor, fotografías y baja mínima',()=>{
 const r=parse(JSON.stringify(feed()),'application/json');assert.equal(r.rows[0].precio,4500000);assert.equal(r.rows[0].estatus,'publicada');assert.equal(r.rows[0].asesor_email,'prueba@example.com');
 const f=feed();f.propiedades=[{id:'PRUEBA-1',estatus:'vendida'}];assert.equal(parse(JSON.stringify(f),'application/json').rows[0].estatus,'vendida');
});
test('XML admite una sola propiedad, listas y ceros iniciales en IDs y CP',()=>{
 const raw='<feed><version>1</version><envio_id>xml-1</envio_id><generado_at>2026-11-11T10:00:00Z</generado_at><modo>completo</modo><total>1</total><propiedades><propiedad><id>000123</id><titulo>Casa</titulo><estatus>activa</estatus><operacion>venta</operacion><tipo>Casa</tipo><precio>4500000</precio><moneda>MXN</moneda><estado>Ciudad de México</estado><municipio>Benito Juárez</municipio><cp>03100</cp><imagenes><foto>https://example.com/1.jpg</foto><foto>https://example.com/2.jpg</foto></imagenes></propiedad></propiedades></feed>';
 const r=parse(raw,'application/xml');assert.equal(r.rows[0].fuente_id,'000123');assert.equal(r.rows[0].cp,'03100');assert.equal(r.rows[0].imagenes.length,2);
});
test('rechaza lotes truncados, IDs repetidos, estatus desconocidos y datos inválidos',()=>{
 for(const change of [f=>f.total=2,f=>{f.total=2;f.propiedades.push({...property})},f=>f.propiedades[0].estatus='activo?',f=>f.propiedades[0].precio='4,500,000',f=>f.propiedades[0].imagenes=['javascript:alert(1)'],f=>delete f.propiedades[0].municipio,f=>f.propiedades=[],f=>f.generado_at='mañana',f=>f.propiedades[0].lat=100]){
  const f=feed();change(f);assert.throws(()=>parse(JSON.stringify(f),'application/json'));
 }
 assert.throws(()=>parse('<!DOCTYPE feed [<!ENTITY a SYSTEM "file:///x">]><feed/>','application/xml'));
 assert.throws(()=>parse('<feed><propiedades></feed>','application/xml'));
 assert.throws(()=>parse('{}','text/plain'));
});

