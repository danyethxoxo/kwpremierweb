import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../hub/admin.html', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/hyper-processor/index.ts', import.meta.url), 'utf8');

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
