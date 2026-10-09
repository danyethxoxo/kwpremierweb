import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { sincronizarFirmantes, nombresEtiquetasWeetrust } from '../supabase/functions/firmar-documento/firmantes-sync.ts';

test('recupera firmantes de weetrust aunque la lista local esté vacía', () => {
  const resultado = sincronizarFirmantes([], [{ name: 'Anai Trejo', emailID: 'ANAI@KW.MX', isSigned: 0, signatoryID: 'uno' }], 'ahora');
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].nombre, 'Anai Trejo');
  assert.equal(resultado[0].correo, 'anai@kw.mx');
  assert.equal(resultado[0].firmado, false);
});

test('agrega nuevos firmantes y conserva datos locales y fecha de firma', () => {
  const previos = [{ correo: 'anai@kw.mx', firmado_at: 'antes', imagen: 'trazo', extra: 'local' }, { correo: 'otro@kw.mx' }];
  const suyos = [{ emailID: 'ANAI@KW.MX', isSigned: 1 }, { emailID: 'nuevo@kw.mx', isSigned: 1 }];
  const resultado = sincronizarFirmantes(previos, suyos, 'ahora');
  assert.equal(resultado.length, 3);
  assert.equal(resultado[0].firmado_at, 'antes');
  assert.equal(resultado[0].extra, 'local');
  assert.equal(resultado[0].imagen, 'trazo');
  assert.equal(resultado[1].firmado_at, 'ahora');
  assert.equal(sincronizarFirmantes(previos, [], 'ahora').length, 2);
});

test('recupera etiquetas enviadas por weetrust sin duplicar nombres ni inventar etiquetas', () => {
  assert.deepEqual(nombresEtiquetasWeetrust({ tags: ['anai-trejo', { tagName: 'ok' }, { name: 'anai-trejo' }, {}] }), ['anai-trejo', 'ok']);
  assert.deepEqual(nombresEtiquetasWeetrust({}), []);
});

test('solo un 404 confirma que el documento no existe; una respuesta incorrecta no lo elimina', async () => {
  const source = fs.readFileSync(new URL('../supabase/functions/firmar-documento/index.ts', import.meta.url), 'utf8');
  const inicio = source.indexOf('async function pedirDocumento(');
  const funcion = stripTypeScriptTypes(source.slice(inicio, source.indexOf('\n}', inicio) + 2));
  let respuesta = { status: 200, data: { documentID: 'correcto' } };
  let url;
  const contexto = vm.createContext({ WEETRUST_URL: 'https://api.weetrust.mx',
    encabezados: () => ({}), leerRespuesta: async (res) => res.data,
    fetch: async (destino) => { url = destino; return respuesta; },
  });
  vm.runInContext(funcion, contexto);
  assert.equal((await vm.runInContext('pedirDocumento("token", "correcto")', contexto)).documentID, 'correcto');
  assert.equal(url, 'https://api.weetrust.mx/documents/correcto');
  respuesta = { status: 200, data: [{ documentID: 'equivocado' }] };
  await assert.rejects(vm.runInContext('pedirDocumento("token", "correcto")', contexto), /no se marcará como eliminado/);
  respuesta = { status: 404 };
  assert.equal(await vm.runInContext('pedirDocumento("token", "correcto")', contexto), null);
});
