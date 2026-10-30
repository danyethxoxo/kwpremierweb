import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { esReciente, cargarHistorial, datosDictamen } = require('../assets/js/notif-bell.js');

test('dictámenes: recuperar asesor, estatus, dirección y folio del historial sin perder puntuación', () => {
  for (const estatus of ['Devuelto', 'Autorizado condicionado', 'Autorizado para promoción']) {
    const n = { tipo: 'dictamen', titulo: `${estatus}: Av. Juárez 12: interior 3`, mensaje: 'Expediente de Lic. María López. Folio D-2026-001.' };
    assert.deepEqual(datosDictamen(n), { asesor: 'Lic. María López', estatus: estatus === 'Autorizado para promoción' ? 'Autorizado' : estatus, direccion: 'Av. Juárez 12: interior 3', folio: 'D-2026-001' });
  }
  assert.equal(datosDictamen({ tipo: 'ticket', titulo: 'Devuelto: Otro aviso', mensaje: 'Expediente de Ana. Folio 1.' }), null);
  assert.equal(datosDictamen({ tipo: 'dictamen', titulo: 'Dictamen actualizado', mensaje: 'Revisa los cambios' }), null);
  assert.equal(datosDictamen({ tipo: 'dictamen' }), null);
});

test('dictámenes: aviso nuevo conserva asunto, asesor y dirección del correo', () => {
  for(const separador of ['\n\n','\\n\\n'])assert.deepEqual(datosDictamen({tipo:'dictamen',titulo:'Dictamen de expediente: Autorizado',mensaje:'Dictamen de María López con dirección:'+separador+'Av. Juárez 12'}),{asesor:'María López',estatus:'Autorizado',direccion:'Av. Juárez 12',folio:''});
  assert.deepEqual(datosDictamen({tipo: 'dictamen', titulo: 'Dictamen de expediente: Autorizado',
    mensaje: 'Hola: María López, te compartimos el dictamen de expediente de tu listado con dirección:\n\nAv. Juárez 12: interior 3'}),
  {asesor: 'María López', estatus: 'Autorizado', direccion: 'Av. Juárez 12: interior 3', folio: ''});
});

test('notificaciones: el límite de 24 horas y la lectura no borran el historial', () => {
  const ahora = Date.parse('2026-10-19T18:00:00Z');
  const n = { leido: false, created_at: '2026-10-18T18:00:00.001Z' };
  assert.equal(esReciente(n, ahora), true);
  assert.equal(esReciente({ ...n, created_at: '2026-10-18T18:00:00Z' }, ahora), false);
  assert.equal(esReciente({ ...n, created_at: '2026-10-17T18:00:00Z' }, ahora), false);
  assert.equal(esReciente({ ...n, leido: true }, ahora), false);
  assert.equal(esReciente({ ...n, created_at: 'fecha inválida' }, ahora), false);
});

test('notificaciones: cargar todas las páginas y filtrar siempre por el usuario', async () => {
  const seed = Array.from({ length: 235 }, (_, id) => ({ id }));
  const requests = [];
  const client = { from(table) {
    const q = { table, filters: [], orders: [] };
    return { select() { return this; }, eq(...args) { q.filters.push(args); return this; },
      order(...args) { q.orders.push(args); return this; },
      range(from, to) { requests.push(q); return { data: seed.slice(from, to + 1), error: null }; } };
  } };
  const result = await cargarHistorial(client, 'usuario-propio');
  assert.deepEqual(result, seed);
  assert.equal(requests.length, 3);
  for (const q of requests) {
    assert.equal(q.table, 'notificaciones');
    assert.deepEqual(q.filters, [['user_id', 'usuario-propio']]);
    assert.deepEqual(q.orders.map(([col]) => col), ['created_at', 'id']);
  }
});

test('notificaciones: un error en una página no se presenta como un historial completo', async () => {
  const client = { from() { return { select() { return this; }, eq() { return this; }, order() { return this; },
    range() { return { data: null, error: new Error('Sin conexión') }; } }; } };
  await assert.rejects(cargarHistorial(client, 'usuario'), /Sin conexión/);
});
