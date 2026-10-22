import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {setImmediate} from 'node:timers/promises';

test('documentos: comparte la consulta en curso y conserva el listado durante un reintento fallido',async()=>{
  const paneles={};
  for(const id of ['lista-borradores','lista-finalizados'])paneles[id]={innerHTML:'',querySelector:()=>null};
  let resolver,consultas=0;
  const q={select(){return this;},eq(){return this;},order(){consultas++;return new Promise(r=>resolver=r);}};
  const context=vm.createContext({window:{kwSession:{usuarioInicial:async()=>({data:{user:{id:'qa'}}})},kwSupabase:{from:()=>q}},
    document:{getElementById:id=>paneles[id]},console:{error(){}},documentosCache:[],TIPO_DOCUMENTO:'acuerdo_referido',escapeHtml:String});
  vm.runInContext(readFileSync(new URL('../assets/js/kw-documentos-lista.js',import.meta.url),'utf8'),context);
  vm.runInContext("renderListaDocumentos=()=>{document.getElementById('lista-borradores').innerHTML='Documento guardado';}",context);
  const primera=context.cargarListaDocumentos();
  assert.equal(context.cargarListaDocumentos(),primera);
  await setImmediate();
  assert.equal(consultas,1);
  resolver({data:[{id:'doc-1'}]});await primera;
  assert.equal(paneles['lista-borradores'].innerHTML,'Documento guardado');
  paneles['lista-borradores'].innerHTML='Menu abierto';
  const igual=context.cargarListaDocumentos();await setImmediate();
  resolver({data:[{id:'doc-1'}]});await igual;
  assert.equal(paneles['lista-borradores'].innerHTML,'Menu abierto');
  const siguiente=context.cargarListaDocumentos();
  assert.equal(paneles['lista-borradores'].innerHTML,'Menu abierto');
  await setImmediate();
  resolver({error:new Error('Falla temporal')});await siguiente;
  assert.equal(consultas,3);
  assert.equal(paneles['lista-borradores'].innerHTML,'Menu abierto');
});
