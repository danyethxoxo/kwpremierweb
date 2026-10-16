import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../assets/js/kw-ficha-propiedad.js', import.meta.url), 'utf8');
const loaders = source.slice(source.indexOf('  function cargarJsPDF()'), source.indexOf('  function pdfFuente('));
for (const [fn, key, property] of [['cargarJsPDF', 'jspdf', 'jsPDF'], ['cargarPdfJs', 'pdfjsLib', 'getDocument']]) {
  test(fn + ': comparte descarga y permite reintentar tras un corte de red', async () => {
    const scripts = [], global = {};
    const ctx = vm.createContext({ global, jsPdfPromesa: null, pdfJsPromesa: null,
      document: { createElement: () => ({}), head: { appendChild: script => scripts.push(script) } } });
    vm.runInContext(loaders, ctx);
    const first = ctx[fn](); assert.equal(ctx[fn](), first); assert.equal(scripts.length, 1);
    scripts[0].onerror(); await assert.rejects(first, /No se pudo cargar/);
    const second = ctx[fn](); assert.equal(scripts.length, 2);
    global[key] = { [property]() {}, GlobalWorkerOptions: {} };
    scripts[1].onload(); assert.ok(await second);
  });
}
