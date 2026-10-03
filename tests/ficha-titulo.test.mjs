import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/js/kw-ficha-propiedad.js', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('  function ajustarTituloFicha('), source.indexOf('  function pin('));

test('la ficha conserva títulos de hasta 300 caracteres y los ajusta antes de la dirección', () => {
  const context = vm.createContext({ texto: value => String(value || '') });
  vm.runInContext(helper, context);
  for (const titulo of ['Casa en venta', 'Departamento en venta con terraza, tres recámaras y dos estacionamientos en una excelente ubicación cerca de parques y escuelas. '.repeat(3).slice(0, 300)]) {
    const result = context.ajustarTituloFicha(titulo, (text, size) => {
      const lines = []; let line = '';
      for (const word of text.split(/\s+/)) {
        const next = line ? line + ' ' + word : word;
        if (line && next.length * size * 0.55 > 570) { lines.push(line); line = word; }
        else line = next;
      }
      if (line) lines.push(line);
      return lines;
    });
    assert.equal(result.lineas.join(' '), titulo.trim().toLocaleUpperCase('es-MX'));
    assert(result.y + (result.lineas.length - 1) * result.alto < 745);
    assert(result.tamano >= 20, 'El título sigue siendo legible');
  }
});
