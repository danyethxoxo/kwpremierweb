import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../assets/js/kw-firmas-carga.js';

const pausa = ms => new Promise(resolve => setTimeout(resolve, ms));
function escenario(leer) {
  const estado = { ocupado: false, pintadas: [], errores: [] };
  estado.carga = globalThis.kwFirmasCarga.crear({
    leer, espera: 5, clave: JSON.stringify,
    ocupado: () => estado.ocupado,
    aplicar: datos => estado.pintadas.push(datos),
    error: error => estado.errores.push(error.message),
  });
  return estado;
}

test('comparte consultas concurrentes y no repinta resultados iguales', async () => {
  let consultas = 0, resolver;
  const e = escenario(() => { consultas++; return new Promise(r => { resolver = r; }); });
  const a = e.carga.cargar(), b = e.carga.cargar();
  assert.equal(a, b);
  await pausa(0);
  resolver([{ id: 'uno', estado: 'pendiente' }]);
  await a;
  const c = e.carga.cargar();
  await pausa(0);
  resolver([{ id: 'uno', estado: 'pendiente' }]);
  await c;
  assert.equal(consultas, 2);
  assert.equal(e.pintadas.length, 1);
});

test('los datos y botones no cambian mientras el menu o editor esta abierto', async () => {
  let version = 0;
  const e = escenario(async () => [{ id: String(++version) }]);
  await e.carga.cargar();
  e.ocupado = true;
  await e.carga.cargar();
  await e.carga.cargar();
  assert.deepEqual(e.pintadas, [[{ id: '1' }]]);
  e.ocupado = false;
  e.carga.aplicarPendiente();
  assert.deepEqual(e.pintadas, [[{ id: '1' }], [{ id: '3' }]]);
});

test('agrupa rafagas y alcanza cambios recibidos durante una consulta', async () => {
  let consultas = 0, resolver;
  const e = escenario(() => { consultas++; return new Promise(r => { resolver = r; }); });
  for (let i = 0; i < 50; i++) e.carga.programar();
  await pausa(20);
  assert.equal(consultas, 1);
  for (let i = 0; i < 50; i++) e.carga.programar();
  resolver([{ id: 'primero' }]);
  await pausa(20);
  assert.equal(consultas, 2);
  resolver([{ id: 'ultimo' }]);
  await pausa(10);
  assert.equal(consultas, 2);
  assert.deepEqual(e.pintadas.at(-1), [{ id: 'ultimo' }]);
});

test('un error conserva el historial y permite reintentar', async () => {
  let falla = false;
  const e = escenario(async () => { if (falla) throw Error('sin red'); return ['documento']; });
  await e.carga.cargar();
  falla = true;
  await e.carga.cargar();
  assert.deepEqual(e.pintadas, [['documento']]);
  assert.deepEqual(e.errores, ['sin red']);
  falla = false;
  await e.carga.cargar();
  assert.equal(e.pintadas.length, 1);
});
