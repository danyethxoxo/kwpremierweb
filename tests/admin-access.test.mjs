import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const html = readFileSync(new URL('../hub/admin.html', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/hyper-processor/index.ts', import.meta.url), 'utf8');
const base = readFileSync(new URL('../hub/base-asesores.html', import.meta.url), 'utf8');

test('Excel import uses bounded batches, stops on failures and preserves the real error', async () => {
  const calls = [];
  let failure = null;
  const context = vm.createContext({
    console: { error() {} }, window: { kwSupabase: { rpc: async (name, args) => {
      calls.push(args.p_personas); return { error: calls.length === 2 ? failure : null };
    } } },
  });
  const start = html.indexOf('  async function sincronizarBaseDesdeLibro(');
  vm.runInContext(html.slice(start, html.indexOf('  if (document.documentElement', start)), context);
  const personas = Array.from({ length: 47 }, (_, i) => ({ correo: 'asesor' + i + '@example.com' }));
  await context.sincronizarBaseDesdeLibro([{ clave: 'activos', hoja: 'Activos', personas }]);
  assert.deepEqual(calls.map((batch) => batch.length), [20, 20, 7]);
  assert.equal(calls.flat().length, 47);
  assert.ok(calls.flat().every((p) => p.grupo === 'activos' && p.hoja === 'Activos'));
  calls.length = 0;
  failure = { code: '57014' };
  await assert.rejects(() => context.sincronizarBaseDesdeLibro([{ personas }]), /Filas 21 a 40: Código 57014/);
  assert.equal(calls.length, 2);
  calls.length = 0;
  failure = 'Servicio no disponible';
  await assert.rejects(() => context.sincronizarBaseDesdeLibro([{ personas }]), /Servicio no disponible/);
});

test('opening a populated directory still imports Excel; overlapping refreshes are skipped', async () => {
  const calls = [];
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const element = { disabled: false, classList: { add() {}, remove() {} } };
  const context = vm.createContext({
    recargaAsesoresEnCurso: false, ultimaLecturaLibro: 0, Date,
    document: { getElementById: () => element }, gruposAsesores: [{ clave: 'asesor_activo' }], bdAsesores: [{ correo: 'viejo@example.com' }],
    leerBaseDatos: async () => true, gruposDesdeBase: () => [{ clave: 'asesor_activo' }],
    armarTabsAsesores() {}, pintarGrupos() {}, cargarEstadoGoogle() {}, terminarRecarga() {}, avisoAsesores() {}, hojasDelLibro: {},
    llamarAlta: async () => { calls.push('read'); await pending; return { grupos: [{ clave: 'activos', personas: [{ correo: 'nuevo@example.com' }] }] }; },
    sincronizarBaseDesdeLibro: async (grupos) => { calls.push(grupos[0].personas[0].correo); },
  });
  vm.runInContext(html.slice(html.indexOf('  async function cargarAsesores('), html.indexOf('  function actualizarLibroAutomaticamente(')), context);
  const loading = context.cargarAsesores();
  await new Promise((resolve) => setImmediate(resolve));
  await context.cargarAsesores(true);
  assert.deepEqual(calls, ['read']);
  release();
  await loading;
  assert.deepEqual(calls, ['read', 'nuevo@example.com']);
  assert.equal(context.recargaAsesoresEnCurso, false);
  assert.ok(context.ultimaLecturaLibro > 0);
});

test('automatic Excel polling waits two minutes and pauses while hidden or editing accesses', () => {
  let calls = 0;
  const context = vm.createContext({ puedeSincronizarLibro: true, document: { hidden: false }, recargaAsesoresEnCurso: false,
    verificacionOcupada: false, ultimaLecturaLibro: Date.now(), Date, cargarAsesores: () => { calls++; } });
  vm.runInContext(html.slice(html.indexOf('  function actualizarLibroAutomaticamente('), html.indexOf('  setInterval(actualizarLibroAutomaticamente')), context);
  context.actualizarLibroAutomaticamente();
  assert.equal(calls, 0);
  context.ultimaLecturaLibro = 0;
  context.actualizarLibroAutomaticamente();
  assert.equal(calls, 1);
  context.document.hidden = true;
  context.actualizarLibroAutomaticamente();
  assert.equal(calls, 1);
  context.document.hidden = false;
  context.verificacionOcupada = true;
  context.actualizarLibroAutomaticamente();
  assert.equal(calls, 1);
});

test('Excel ranges include new rows beyond the historical 500-row limit', () => {
  for (const configured of ['A1:Z500', "'Activos'!A1:Z500", 'A:Z']) {
    const context = vm.createContext({ ALTA_SHEET_RANGO: configured });
    vm.runInContext(edge.slice(edge.indexOf('const RANGO_CONFIGURADO ='), edge.indexOf('// Sin hoja se lee')), context);
    assert.equal(vm.runInContext('RANGO_CELDAS', context), 'A:Z');
  }
});

test('activating provisions both accounts; baja preserves contacts; unchanged status does not resend grants', async () => {
  const calls = [];
  let ok = true;
  const context = vm.createContext({ asesores: [], estatusDe: (a) => a.grupo,
    window: { kwSupabase: { functions: { invoke: async (name, request) => { calls.push(request.body); return { data: { ok } }; } } } },
  });
  vm.runInContext(base.slice(base.indexOf('  async function sincronizarAccesosDeEstatus('), base.indexOf('  // ── Fechas')), context);
  const activo = { id: '1', correo: 'test@example.com', grupo: 'asesor_activo' };
  const baja = { ...activo, grupo: 'asesor_baja' };
  await context.sincronizarAccesosDeEstatus(activo, baja);
  assert.equal(calls[0].todasCuentas, true);
  assert.deepEqual(Array.from(calls[0].pasos), ['contactos', 'drive', 'calendario']);
  await context.sincronizarAccesosDeEstatus(baja, activo);
  assert.equal(calls[1].quitar, true);
  assert.deepEqual(Array.from(calls[1].pasos), ['drive', 'calendario']);
  await context.sincronizarAccesosDeEstatus(activo, activo);
  assert.equal(calls.length, 2);
  await context.sincronizarAccesosDeEstatus(activo, null);
  assert.equal(calls.length, 3);
  await assert.rejects(() => context.sincronizarAccesosDeEstatus({ ...activo, correo: '' }, null), /Falta el correo/);
  ok = false;
  await assert.rejects(() => context.sincronizarAccesosDeEstatus(activo, baja), /estado no se cambió/);
  ok = true;
  calls.length = 0;
  await context.sincronizarAccesosDeEstatus({ ...activo, correo: 'nuevo@example.com' }, activo);
  assert.equal(calls[0].quitar, true);
  assert.equal(calls[0].personas[0].correo, activo.correo);
  assert.equal(calls[1].quitar, false);
});

test('automatic grants create contacts once across accounts and grant Drive/Calendar separately per account', async () => {
  const calls = [];
  const context = vm.createContext({
    moverAcceso: async (paso, quitar, token, cuentas) => { calls.push({ paso, quitar, cuentas }); return { paso, ok: true, detalle: 'ok' }; },
    moverAccesos: async (pasos, quitar, token, cuentas) => { calls.push({ pasos, quitar, token, cuentas }); return pasos.map((paso) => ({ paso, ok: true, detalle: 'ok' })); },
  });
  vm.runInContext(stripTypeScriptTypes(edge.slice(edge.indexOf('async function otorgarAccesosPorCuenta('), edge.indexOf('async function retirarAccesosPorCuenta('))), context);
  const cuentas = [{ clave: 'original', nombre: 'Dani', token: 'one', accesosCompletos: true }, { clave: 'premier', nombre: 'Premier', token: 'two', accesosCompletos: true }];
  const estado = { drivePorCuenta: new Map(), calendarioPorCuenta: new Map() };
  const results = await context.otorgarAccesosPorCuenta(['contactos', 'drive', 'calendario'], cuentas, {}, estado, true);
  assert.equal(results.length, 5);
  assert.equal(calls[0].cuentas.length, 2);
  assert.equal(calls[1].token, 'one');
  assert.equal(calls[2].token, 'two');
  assert.deepEqual(Array.from(calls[1].pasos), ['drive', 'calendario']);
  cuentas[1].accesosCompletos = false;
  assert.ok((await context.otorgarAccesosPorCuenta(['drive'], cuentas, {}, estado, true)).some((r) => !r.ok));
});

test('access cards show only permission dates and never substitute advisor dates', () => {
  const context = vm.createContext({
    bdAsesores: [{ correo: 'asesor@example.com' }],
    personaDesdeBase: () => ({ fechaIngreso: '2026-01-02', fechaBaja: '2026-09-30' }),
    escapeHtml: (value) => value, desgloseAccesosVerifHtml: () => '<div>Por cuenta</div>',
  });
  vm.runInContext(html.slice(html.indexOf('  function detallePersonaVerifHtml('), html.indexOf('  function desgloseAccesosVerifHtml(')), context);
  const result = context.detallePersonaVerifHtml({ correo: 'asesor@example.com' });
  assert.ok(!result.includes('2026-01-02'));
  assert.ok(!result.includes('2026-09-30'));
  assert.ok(!result.includes('Por cuenta'));
  assert.match(result, /Accesos otorgados: sin fecha registrada/);
  assert.match(result, /Accesos retirados: sin fecha registrada/);
  assert.match(html, /<span>Seleccionar todo<\/span>/);
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

test('card status actions synchronize grants or removals before changing the group; failures preserve the group', async () => {
  for (const destino of ['asesor_activo', 'asesor_baja']) for (const ok of [true, false]) {
    const calls = [];
    const chain = { update: (data) => { calls.push({ kind: 'group', data }); return chain; }, eq: () => chain, select: () => chain, single: async () => ({}) };
    const context = vm.createContext({
      bdAsesores: [{ id: '1', nombre: 'Asesor de prueba', correo: 'test@example.com' }],
      window: { kwUI: { confirm: async () => true }, kwSupabase: { from: () => chain } },
      llamarAlta: async (data) => { calls.push({ kind: 'access', data }); return { ok, estado: [] }; },
      aplicarEstado() {}, mensajeDeResultado: () => 'Error al retirar accesos', leerBaseDatos: async () => true,
      gruposDesdeBase: () => [], armarTabsAsesores() {}, pintarGrupos() {}, avisoAsesores() {}, BD_TITULO: {},
      grupoActivo: '', gruposAsesores: [], esDeBaja: (grupo) => grupo === 'asesor_baja',
    });
    const start = html.indexOf('  async function pasarAsesorABaja(');
    const end = html.indexOf('  // ── Cargar', start);
    vm.runInContext(html.slice(start, end), context);
    await context.pasarAsesorABaja({ dataset: { bajaAsesor: '1', bajaGrupo: destino } });
    assert.equal(calls[0].kind, 'access');
    assert.deepEqual(Array.from(calls[0].data.pasos), destino === 'asesor_baja' ? ['drive', 'calendario'] : ['contactos', 'drive', 'calendario']);
    assert.equal(calls[0].data.quitar, destino === 'asesor_baja');
    assert.equal(calls[0].data.todasCuentas, true);
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
