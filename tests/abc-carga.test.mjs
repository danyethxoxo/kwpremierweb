import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../documentos/internos/dt/abc-tracker.html', import.meta.url), 'utf8');
function funcion(nombre) {
  const start = html.search(new RegExp('  (?:async )?function ' + nombre + '\\('));
  assert.ok(start >= 0, nombre);
  return html.slice(start, html.indexOf('\n  }', start) + 4);
}
function contexto(extra = {}) {
  const elementos = new Map();
  return vm.createContext({ Promise, Map, Set, Array, Object, String, Number, Math,
    document: { getElementById(id) {
      if (!elementos.has(id)) elementos.set(id, { disabled: false, style: {}, innerHTML: '' });
      return elementos.get(id);
    } }, esc: String, puedeEditar: false, ...extra });
}
function cliente(rol = 'staff') {
  return { kwSession: { async usuario() { return { data: { user: { id: 'u' } } }; } },
    kwSupabase: { from() { return { select() { return this; }, eq() { return this; },
      async single() { return { data: { role: rol } }; } }; } } };
}

test('ABC muestra datos antes de comenzar la sincronización externa', async () => {
  const eventos = [], cuadros = [];
  const ctx = contexto({ window: cliente(),
    async cargar() { eventos.push('datos'); }, pintar() { eventos.push('visible'); },
    sincronizarAlEntrar() { eventos.push('excel'); return new Promise(() => {}); },
    requestAnimationFrame(callback) { cuadros.push(callback); } });
  vm.runInContext(funcion('iniciar'), ctx);
  await ctx.iniciar();
  assert.deepEqual(eventos, ['datos', 'visible']);
  assert.equal(cuadros.length, 1);
  cuadros[0]();
  assert.deepEqual(eventos, ['datos', 'visible', 'excel']);
});

test('ABC deniega el acceso antes de leer datos o sincronizar', async () => {
  const ctx = contexto({ window: cliente('asesor'),
    cargar() { assert.fail('lectura sin permiso'); },
    sincronizarAlEntrar() { assert.fail('sincronización sin permiso'); },
    requestAnimationFrame() { assert.fail('cuadro sin permiso'); } });
  vm.runInContext(funcion('iniciar'), ctx);
  await ctx.iniciar();
  assert.equal(ctx.document.getElementById('contenido').style.display, 'none');
  assert.equal(ctx.document.getElementById('denegado').style.display, '');
});

test('sincronizar refresca solo el padrón sin reemplazar los checks editados', async () => {
  const llamadas = [], checks = new Map([['1:2', true]]);
  const ctx = contexto({ avance: checks, window: { kwSupabase: { from(tabla) {
    llamadas.push(tabla);
    return { select() { return this; }, async order() { return { data: [{ kwid: '1' }] }; } };
  } } }, async llamarSync(aplicar) {
    llamadas.push(aplicar);
    return { nuevos: ['1'], reactivados: [], bajas: [], total_padron: 10 };
  }, actualizarPadron(datos) { llamadas.push(datos[0].kwid); },
  pintar() { llamadas.push('pintar'); }, avisar() { assert.fail('error inesperado'); } });
  vm.runInContext(funcion('sincronizarAlEntrar'), ctx);
  await ctx.sincronizarAlEntrar();
  assert.deepEqual(llamadas, [false, true, 'abc_asesores', '1', 'pintar']);
  assert.equal(ctx.avance, checks);
  assert.equal(checks.get('1:2'), true);
  assert.equal(ctx.document.getElementById('btn-sync').disabled, false);
});

test('una hoja sin cambios no repinta; bajas excesivas y errores conservan el padrón', async () => {
  for (const tipo of ['sin-cambios', 'bajas', 'error']) {
    let avisos = 0;
    const ctx = contexto({ async llamarSync(aplicar) {
      assert.equal(aplicar, false);
      if (tipo === 'error') throw new Error('Excel sin conexión');
      return { nuevos: [], reactivados: [], bajas: tipo === 'bajas' ? Array(6).fill('1') : [], total_padron: 10 };
    }, pintar() { assert.fail('repintado innecesario'); }, avisar() { avisos++; } });
    vm.runInContext(funcion('sincronizarAlEntrar'), ctx);
    await ctx.sincronizarAlEntrar();
    assert.equal(avisos, tipo === 'sin-cambios' ? 0 : 1);
    assert.equal(ctx.document.getElementById('btn-sync').disabled, false);
  }
});

test('Excel se descarga bajo demanda, comparte la descarga y permite reintentar', async () => {
  assert.doesNotMatch(html, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx/);
  const scripts = [];
  const ctx = contexto({ exportadorPendiente: null, window: {}, document: {
    createElement() { return { remove() {} }; }, head: { appendChild(script) { scripts.push(script); } }
  } });
  vm.runInContext(funcion('cargarExportador'), ctx);
  const primero = ctx.cargarExportador();
  assert.equal(ctx.cargarExportador(), primero);
  assert.equal(scripts.length, 1);
  scripts[0].onerror();
  await assert.rejects(primero, /descargar/);
  const segundo = ctx.cargarExportador();
  assert.equal(scripts.length, 2);
  ctx.window.XLSX = {};
  scripts[1].onload();
  await segundo;
  await ctx.cargarExportador();
  assert.equal(scripts.length, 2);
});

test('todos los scripts inline del ABC mantienen sintaxis válida', () => {
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (script[1].trim()) new vm.Script(script[1]);
  }
});
