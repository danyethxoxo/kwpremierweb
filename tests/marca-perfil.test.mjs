import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/kw-marca-perfil.js', import.meta.url), 'utf8');
function service() {
  const window = {};
  vm.runInNewContext(source, { window, URL, crypto: { randomUUID: () => 'new-photo' }, console });
  return window.kwMarcaPerfil;
}

function client({ userId = 'account-a', failed = false, uploadFailed = false } = {}) {
  const calls = [];
  return { calls, auth: { getSession: async () => ({ data: { session: { user: { id: userId } } } }) },
    storage: { from(bucket) {
      assert.equal(bucket, 'perfiles');
      return {
        upload: async (path, blob, options) => { calls.push(['upload', path, blob, options]); return { error: uploadFailed ? new Error('upload unavailable') : null }; },
        getPublicUrl: path => ({ data: { publicUrl: 'https://storage.example/' + path } }),
        remove: async paths => { calls.push(['remove', paths]); return {}; }
      };
    } },
    from(table) {
      assert.equal(table, 'profiles');
      return { update(data) { calls.push(['update', data]); return { eq(field, id) {
        calls.push(['owner', field, id]); return { select: () => ({ single: async () => failed
          ? { error: new Error('save unavailable') }
          : { data: { nombre: 'Ana', apellido: 'Perez', email: 'ana@example.com', ...data } } }) };
      } }; } };
    }
  };
}

test('branding requires valid contact data and skips already complete profiles', () => {
  const brand = service();
  assert.equal(brand.completo({ foto_url: 'https://storage.example/ana.jpg', whatsapp: '+52 55 1234 5678', sitio_web: 'cava.kw.com' }), true);
  for (const missing of ['foto_url', 'whatsapp', 'sitio_web']) {
    const profile = { foto_url: 'https://storage.example/ana.jpg', whatsapp: '5512345678', sitio_web: 'cava.kw.com' };
    delete profile[missing];
    assert.equal(brand.completo(profile), false);
  }
  for (const phone of ['123', 'phone 5512345678', '55123456789012345']) assert.throws(() => brand.validar(phone, 'cava.kw.com'));
  for (const url of ['https://evil.example', 'https://cava.kw.com.evil.example', 'https://user@cava.kw.com', 'javascript:alert(1)']) assert.throws(() => brand.validar('5512345678', url));
});

test('branding saves only the current account and uploads a separate photo before updating', async () => {
  const sb = client();
  const saved = await service().guardar(sb, 'account-a', { whatsapp: '+52 55 1234 5678', sitio_web: 'cava.kw.com/about' }, 'photo-blob');
  assert.equal(saved.sitio_web, 'https://cava.kw.com');
  assert.equal(saved.foto_url, 'https://storage.example/account-a/foto-marca-new-photo.jpg');
  assert.deepEqual(sb.calls.map(c => c[0]), ['upload', 'update', 'owner']);
  assert.equal(sb.calls[0][3].upsert, false);
  assert.deepEqual(sb.calls[2], ['owner', 'id', 'account-a']);
  assert.equal(sb.calls[1][1].nombre, undefined);
});

test('branding rejects account switches and removes a new upload when profile saving fails', async () => {
  const changed = client({ userId: 'account-b' });
  await assert.rejects(service().guardar(changed, 'account-a', { whatsapp: '5512345678', sitio_web: 'cava.kw.com' }, 'blob'), /sesión cambió/);
  assert.equal(changed.calls.length, 0);
  const failed = client({ failed: true });
  await assert.rejects(service().guardar(failed, 'account-a', { whatsapp: '5512345678', sitio_web: 'cava.kw.com' }, 'blob'), /save unavailable/);
  assert.equal(failed.calls.at(-1)[0], 'remove');
  assert.equal(failed.calls.at(-1)[1][0], 'account-a/foto-marca-new-photo.jpg');
  const uploadFailed = client({ uploadFailed: true });
  await assert.rejects(service().guardar(uploadFailed, 'account-a', { whatsapp: '5512345678', sitio_web: 'cava.kw.com' }, 'blob'), /upload unavailable/);
  assert.equal(uploadFailed.calls.some(c => c[0] === 'update'), false);
});

test('editing contact info keeps the account photograph when no new file is chosen', async () => {
  const sb = client();
  await service().guardar(sb, 'account-a', { whatsapp: '5512345678', sitio_web: 'cava.kw.com' }, null);
  assert.equal(sb.calls.some(c => c[0] === 'upload'), false);
  assert.equal(sb.calls[0][1].foto_url, undefined);
});

test('technical sheets use the logged-in account profile without consulting KW or another advisor', async () => {
  const html = readFileSync(new URL('../propiedades.html', import.meta.url), 'utf8');
  const start = html.indexOf('  function datosAsesorFichaBase');
  const end = html.indexOf('  function cargarFotosFicha', start);
  const context = {
    sitioAsesorPerfil: { nombre: 'Ana', apellido: 'Perez', foto_url: 'https://storage.example/ana.jpg', whatsapp: '5512345678', email: 'ana@example.com' },
    sitioAsesor: 'https://cava.kw.com', asesoresFichaCache: {},
    sb: { from() { throw new Error('Must not fetch property owner'); }, functions: { invoke() { throw new Error('Must not query KW'); } } }
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  const advisor = await context.cargarAsesorFicha({ asesor_id: 'another-agent', asesor_nombre: 'Another Agent' });
  assert.equal(advisor.nombre, 'Ana');
  assert.equal(advisor.foto_url, 'https://storage.example/ana.jpg');
  assert.equal(advisor.sitio_web, 'https://cava.kw.com');
});
