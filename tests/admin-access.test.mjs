import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const html = readFileSync(new URL('../hub/admin.html', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/hyper-processor/index.ts', import.meta.url), 'utf8');

test('access cards keep account details collapsed and show real advisor dates only', () => {
  const context = vm.createContext({
    bdAsesores: [{ correo: 'asesor@example.com' }],
    personaDesdeBase: () => ({ fechaIngreso: '2026-01-02', fechaBaja: '2026-09-30' }),
    escapeHtml: (value) => value, desgloseAccesosVerifHtml: () => '<div>Por cuenta</div>',
  });
  vm.runInContext(html.slice(html.indexOf('  function detallePersonaVerifHtml('), html.indexOf('  function desgloseAccesosVerifHtml(')), context);
  const result = context.detallePersonaVerifHtml({ correo: 'asesor@example.com' });
  assert.match(result, /2026-01-02/);
  assert.match(result, /2026-09-30/);
  assert.match(result, /sin registro histórico disponible/);
  assert.match(context.detallePersonaVerifHtml({ correo: 'otro@example.com' }), /Sin registro/);
  assert.ok(!html.includes('<p class="verif-ayuda">'));
  assert.match(html, /class="verif-detalle".*abierto \? '' : ' hidden'/);
  assert.match(html, /verifAbiertos\.has\(p\.correo\)/);
});

test('account breakdown shows confirmed statuses for both accounts, without assuming unknown means removed', () => {
  const context = vm.createContext({
    esMaster: () => true, escapeHtml: (value) => value, desgloseContactosHtml: () => '',
    cuentasContactosInfo: [{ clave: 'dani', nombre: 'Dani', accesosCompletos: true }, { clave: 'premier', nombre: 'Premier', accesosCompletos: true }],
  });
  vm.runInContext(html.slice(html.indexOf('  function desgloseAccesosVerifHtml('), html.indexOf('  function pintarSeleccion(')), context);
  const result = context.desgloseAccesosVerifHtml({ drivePorCuenta: { dani: false, premier: false }, calendarioPorCuenta: { dani: false, premier: true } });
  assert.match(result, /Dani/);
  assert.match(result, /Premier/);
  assert.equal((result.match(/sin acceso/g) || []).length, 3);
  assert.equal((result.match(/con acceso/g) || []).length, 1);
  assert.match(context.desgloseAccesosVerifHtml({ drivePorCuenta: {}, calendarioPorCuenta: {} }), /por comprobar/);
  assert.match(html, /fila\.drivePorCuenta = e\.drivePorCuenta/);
  assert.match(html, /fila\.calendarioPorCuenta = e\.calendarioPorCuenta/);
});

test('removing all or selected Google accesses never includes contacts', () => {
  const client = vm.createContext({});
  vm.runInContext(html.slice(html.indexOf('  function pasosDeOperacion('), html.indexOf('  function textoDeAccesos(')), client);
  assert.deepEqual(Array.from(client.pasosDeOperacion(null, true)), ['drive', 'calendario']);
  assert.deepEqual(Array.from(client.pasosDeOperacion(['contactos', 'drive'], true)), ['drive']);
  assert.deepEqual(Array.from(client.pasosDeOperacion(['contactos'], true)), []);
  const policy = edge.slice(edge.indexOf('function pasosPedidos('), edge.indexOf("secureServe({ name: 'hyper-processor'"))
    .replace('(valor: unknown, quitar = false): Paso[]', '(valor, quitar = false)').replace(' as Paso[]', '');
  const server = vm.createContext({ PASOS: ['contactos', 'drive', 'calendario'] });
  vm.runInContext(policy, server);
  assert.deepEqual(Array.from(server.pasosPedidos(undefined, true)), ['drive', 'calendario']);
  assert.deepEqual(Array.from(server.pasosPedidos(['contactos', 'drive', 'calendario'], true)), ['drive', 'calendario']);
  assert.deepEqual(Array.from(server.pasosPedidos(['contactos'], true)), []);
  assert.deepEqual(Array.from(server.pasosPedidos(undefined, false)), ['contactos', 'drive', 'calendario']);
  assert.ok(!edge.includes(':deleteContact'));
  assert.ok(!edge.includes('borrarContacto'));
});

test('giving an advisor a baja revokes Drive/Calendar before changing the group; failures preserve the group', async () => {
  for (const ok of [true, false]) {
    const calls = [];
    const chain = { update: (data) => { calls.push({ kind: 'group', data }); return chain; }, eq: () => chain, select: () => chain, single: async () => ({}) };
    const context = vm.createContext({
      bdAsesores: [{ id: '1', nombre: 'Asesor de prueba', correo: 'test@example.com' }],
      window: { kwUI: { confirm: async () => true }, kwSupabase: { from: () => chain } },
      llamarAlta: async (data) => { calls.push({ kind: 'access', data }); return { ok, estado: [] }; },
      aplicarEstado() {}, mensajeDeResultado: () => 'Error al retirar accesos', leerBaseDatos: async () => true,
      gruposDesdeBase: () => [], armarTabsAsesores() {}, pintarGrupos() {}, avisoAsesores() {}, BD_TITULO: {},
      grupoActivo: '', gruposAsesores: []
    });
    const start = html.indexOf('  async function pasarAsesorABaja(');
    const end = html.indexOf('  // ── Cargar', start);
    vm.runInContext(html.slice(start, end), context);
    await context.pasarAsesorABaja({ dataset: { bajaAsesor: '1' } });
    assert.equal(calls[0].kind, 'access');
    assert.deepEqual(Array.from(calls[0].data.pasos), ['drive', 'calendario']);
    assert.equal(calls[0].data.quitar, true);
    assert.equal(calls.some((call) => call.kind === 'group'), ok);
  }
});

test('bulk removal checks both Google accounts and never touches contacts', async () => {
  const calls = [];
  const start = edge.indexOf('async function retirarAccesosPorCuenta(');
  const end = edge.indexOf('function pasosPedidos(', start);
  const context = vm.createContext({
    moverAccesos: async (steps, remove, token, accounts, person, state) => {
      calls.push({ steps: Array.from(steps), remove, token, email: person.correo });
      for (const step of steps) state[step].delete(person.correo);
      return steps.map((paso) => ({ paso, ok: true, detalle: 'Retirado' }));
    }
  });
  vm.runInContext(stripTypeScriptTypes(edge.slice(start, end)), context);
  const emails = ['uno@example.com', 'dos@example.com'];
  const accounts = [{ clave: 'original', nombre: 'Original', token: 'one', accesosCompletos: true },
    { clave: 'premier', nombre: 'Premier', token: 'two', accesosCompletos: true }];
  const state = { contactos: new Map(emails.map((email) => [email, 'contact'])),
    drivePorCuenta: new Map(accounts.map((account) => [account.clave, new Map(emails.map((email) => [email, 'permission']))])),
    calendarioPorCuenta: new Map(accounts.map((account) => [account.clave, new Map(emails.map((email) => [email, 'rule']))])) };
  for (const correo of emails) {
    const results = await context.retirarAccesosPorCuenta(['contactos', 'drive', 'calendario'], accounts, { correo }, state);
    assert.equal(results.length, 4);
    assert.ok(results.every((result) => result.ok));
  }
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.remove && !call.steps.includes('contactos')));
  assert.equal(state.contactos.size, 2);
  assert.ok([...state.drivePorCuenta.values(), ...state.calendarioPorCuenta.values()].every((map) => map.size === 0));
});

test('already-removed permissions (404) are success; Google failures remain errors', async () => {
  const start = edge.indexOf('async function quitarCarpeta(');
  const end = edge.indexOf('async function intentar(', start);
  let status = 404;
  const context = vm.createContext({ ALTA_DRIVE_FOLDER_ID: 'folder', GOOGLE_CALENDAR_ID: 'calendar', encodeURIComponent,
    fetch: async () => ({ ok: status === 204, status, text: async () => 'Google error' }) });
  vm.runInContext(stripTypeScriptTypes(edge.slice(start, end)), context);
  for (const name of ['quitarCarpeta', 'quitarAccesoCalendario']) {
    const map = new Map([['test@example.com', 'permission']]);
    await context[name]('token', 'test@example.com', map);
    assert.equal(map.size, 0);
    status = 403;
    map.set('test@example.com', 'permission');
    await assert.rejects(() => context[name]('token', 'test@example.com', map), /403/);
    assert.equal(map.size, 1);
    status = 404;
  }
});

test('selected rows lose their green appearance during removal; other rows are unchanged', () => {
  function button(access) {
    const classes = new Set(['si']);
    return { dataset: { acceso: access }, classList: { remove: (...names) => names.forEach((name) => classes.delete(name)), add: (name) => classes.add(name) }, classes };
  }
  const row = (email) => {
    const buttons = [button('drive'), button('calendario')];
    return { buttons, querySelector: () => ({ dataset: { marcar: email } }), querySelectorAll: () => buttons };
  };
  const rows = [row('uno@example.com'), row('dos@example.com'), row('otro@example.com')];
  const context = vm.createContext({ document: { querySelectorAll: () => rows }, ICONO_RELOJ: 'clock', NOMBRE_ACCESO: { drive: 'Drive', calendario: 'Calendario' } });
  vm.runInContext(html.slice(html.indexOf('  function marcarVerifProcesando('), html.indexOf('  // Cambia accesos desde el modal')), context);
  context.marcarVerifProcesando(['uno@example.com', 'dos@example.com'], ['drive', 'calendario'], true);
  for (const row of rows.slice(0, 2)) for (const button of row.buttons) {
    assert.equal(button.classes.has('si'), false);
    assert.equal(button.classes.has('procesando'), true);
    assert.equal(button.disabled, true);
    assert.match(button.innerHTML, /Retirando/);
  }
  assert.ok(rows[2].buttons.every((button) => button.classes.has('si')));
});
