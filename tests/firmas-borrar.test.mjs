import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../supabase/functions/firmar-documento/index.ts', import.meta.url), 'utf8');
const start = source.indexOf("    if (accion === 'borrar')");
const end = source.indexOf('// ── Registrar los webhooks', start);
const block = source.slice(start, end).replace(/: string \| null/g, '').replace(/ as Error/g, '');
const run = new Function('admin', 'borrarDocumento', 'pedirDocumento', `return (async () => {
  const accion = 'borrar', body = { id: 'documento' }, userId = 'usuario';
  const obtenerToken = async () => 'token';
  const respond = (body, status = 200) => ({ body, status });
  ${block}
})()`);

for (const [message, status] of [['Borrar el documento falló (403): you are not authorised user for this document', 403], ['Proveedor no disponible (503)', 502]]) {
  test(`Conserva el documento si weetrust rechaza el borrado (${status})`, async () => {
    let deleted = false, removed = false;
    const admin = {
      from(table) {
        return {
          select() { return this; }, eq() { return this; },
          async single() { return { data: table === 'profiles' ? { role: 'master' } : { user_id: 'usuario', estado: 'pendiente', weetrust_document_id: 'externo', archivo_ruta: 'original.pdf' } }; },
          delete() { deleted = true; return this; },
        };
      },
      storage: { from() { return { remove() { removed = true; } }; } },
    };
    const result = await run(admin, async () => { throw new Error(message); });
    assert.equal(result.status, status);
    assert.match(result.body.error, /se conserva en KW Premier/);
    assert.equal(deleted, false);
    assert.equal(removed, false);
  });
}

test('quita un documento ya eliminado sin volver a llamar a weetrust', async () => {
  let deleted = false, remote = false;
  const admin = {
    from(table) { return {
      select() { return this; }, eq() { return this; },
      async single() { return { data: table === 'profiles' ? { role: 'master' } : { user_id: 'usuario', estado: 'eliminado', weetrust_document_id: 'externo' } }; },
      delete() { deleted = true; return this; }
    }; }, storage: { from() { return { remove: async () => ({}) }; } }
  };
  const resultado = await run(admin, async () => { remote = true; throw Error('503'); });
  assert.equal(resultado.status, 200);
  assert.equal(deleted, true);
  assert.equal(remote, false);
});

test('un fallo al borrar solo permite limpiar el historial si otra consulta confirma que ya no existe', async () => {
  let deleted = false;
  const admin = { from(table) { return {
    select() { return this; }, eq() { return this; },
    async single() { return { data: table === 'profiles' ? { role: 'master' } : { user_id: 'usuario', estado: 'pendiente', weetrust_document_id: 'externo' } }; },
    delete() { deleted = true; return this; }
  }; } };
  const resultado = await run(admin, async () => { throw Error('Proveedor no disponible (503)'); }, async () => null);
  assert.equal(resultado.status, 200);
  assert.equal(deleted, true);
});
