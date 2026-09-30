import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const general = 'https://kw.com/es-419/property/6870-Calle-Cartagena-Jurez-Chih-32260/2146705328818484';

function contexto(extra = {}) {
  const context = vm.createContext({ window: {}, URL, ...extra });
  vm.runInContext(readFileSync(new URL('assets/js/kw-sitio-asesor.js', root), 'utf8'), context);
  return context;
}

test('acepta dominio de asesor con o sin protocolo y conserva la propiedad', () => {
  const { normalizar, personalizar } = contexto().window.kwSitioAsesor;
  assert.equal(normalizar(' DANIGUERRERO.kw.com '), 'https://daniguerrero.kw.com');
  assert.equal(normalizar('http://daniguerrero.kw.com/es-419/'), 'https://daniguerrero.kw.com');
  assert.equal(personalizar(general, 'daniguerrero.kw.com'), general.replace('https://kw.com', 'https://daniguerrero.kw.com'));
  assert.equal(personalizar(general, 'otro-asesor.kw.com'), general.replace('https://kw.com', 'https://otro-asesor.kw.com'));
});

test('no personaliza dominios ajenos, credenciales o enlaces que no son fichas de KW', () => {
  const { normalizar, personalizar } = contexto().window.kwSitioAsesor;
  for (const sitio of ['', 'kw.com', 'www.kw.com', 'kw.com.ejemplo.com', 'daniguerrero.kw.com.ejemplo.com', 'https://usuario@daniguerrero.kw.com', 'https://daniguerrero.kw.com:444', 'javascript:alert(1)', 'https://daniguerrero\\.kw.com', 'foo.bar.kw.com']) {
    assert.equal(normalizar(sitio), null, sitio);
    assert.equal(personalizar(general, sitio), general, sitio);
  }
  for (const enlace of ['/propiedad.html?id=123', 'https://www.kwmexico.mx/propiedades/463609', 'https://kw.com.ejemplo.com/es-419/property/Casa/123']) {
    assert.equal(personalizar(enlace, 'daniguerrero.kw.com'), enlace);
  }
});

test('la tarjeta abre la ficha del asesor en nueva pestaña y mantiene kw.com sin sitio', () => {
  const context = contexto({
    sitioAsesor: 'daniguerrero.kw.com', ICO: { casa: '' }, ETIQUETA_ESTATUS: {},
    escapeHtml: (value) => String(value || ''), nombreMarketCenter: (value) => value,
    fmtPrecio: () => 'Precio a consultar'
  });
  const html = readFileSync(new URL('propiedades.html', root), 'utf8');
  vm.runInContext(html.slice(html.indexOf('  function tarjeta('), html.indexOf('  function val(')), context);
  const propiedad = { enlace_kw: general, titulo: 'Casa', estatus: 'publicada' };
  let card = context.tarjeta(propiedad, 0);
  assert(card.includes('href="' + general.replace('https://kw.com', 'https://daniguerrero.kw.com') + '"'));
  assert(card.includes('target="_blank" rel="noopener noreferrer"'));
  context.sitioAsesor = null;
  card = context.tarjeta(propiedad, 0);
  assert(card.includes('href="' + general + '"'));
});

test('consulta el sitio del usuario de la sesión y reintenta si falla la lectura', async () => {
  const aviso = {};
  let intentos = 0;
  const context = contexto({ document: { getElementById: () => aviso }, sb: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'asesor-actual' } } } }) },
    from: (tabla) => {
      assert.equal(tabla, 'profiles');
      return { select: (campos) => {
        assert.equal(campos, 'sitio_web');
        return { eq: (campo, id) => {
          assert.equal(campo, 'id');
          assert.equal(id, 'asesor-actual');
          return { single: async () => ++intentos === 1 ? { error: new Error('Error temporal') } : { data: { sitio_web: 'daniguerrero.kw.com' } } };
        } };
      } };
    }
  } });
  const html = readFileSync(new URL('propiedades.html', root), 'utf8');
  const start = html.indexOf('  var sitioAsesor =');
  const end = html.indexOf('  function escapeHtml', start);
  vm.runInContext(html.slice(start, end), context);
  await assert.rejects(context.cargarSitioAsesor(), /Error temporal/);
  await context.cargarSitioAsesor();
  assert.equal(context.sitioAsesor, 'https://daniguerrero.kw.com');
  assert.equal(aviso.hidden, false);
  assert.match(aviso.textContent, /daniguerrero.kw.com/);
  await context.cargarSitioAsesor();
  assert.equal(intentos, 2);
});

test('registro guarda el sitio normalizado únicamente tras confirmar el código', async () => {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { value: '', style: {}, handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; }, focus() {} });
    return elements.get(id);
  };
  const updates = [];
  const mfa = [];
  const sb = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'nuevo-asesor' }, access_token: 'token-prueba' } } }),
      updateUser: async () => ({ error: null })
    },
    from: () => ({ update: (data) => ({ eq: async (field, id) => { updates.push({ data, field, id }); return { error: null }; } }) })
  };
  const context = contexto({
    document: { getElementById: element, querySelectorAll: () => [] },
    localStorage: { getItem: () => 'a'.repeat(43) },
    setTimeout: () => {},
    fetch: async (url, options) => { mfa.push(JSON.parse(options.body).accion); return { ok: true, json: async () => ({ enviado_a: 'correo***' }) }; }
  });
  context.window.supabase = { createClient: () => sb };
  context.window.kwSecurity = { setupOtpInput() {}, validPassword: () => true, focusOtpInput() {}, authErrorMessage: (err) => err.message };
  const html = readFileSync(new URL('completar-registro.html', root), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInContext(script.replace(/\binit\(\);\s*$/, ''), context);
  element('nombre').value = 'Dani';
  element('apellido').value = 'Guerrero';
  element('password').value = element('password2').value = 'password-prueba';
  element('correo-seguridad').value = 'recuperacion@example.com';
  element('sitio-web').value = 'daniguerrero.kw.com';
  await element('completar-form').handlers.submit({ preventDefault() {} });
  assert.equal(updates.length, 0);
  element('codigo-seguridad').value = '123456';
  await element('confirmar-codigo').handlers.click.call(element('confirmar-codigo'));
  assert.deepEqual(mfa, ['preparar', 'confirmar']);
  assert.equal(updates[0].data.sitio_web, 'https://daniguerrero.kw.com');
  assert.equal(updates[0].id, 'nuevo-asesor');
});
