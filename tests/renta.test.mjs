import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../documentos/contratos/renta.html', import.meta.url), 'utf8');

function preview(names, addresses, amount = 27000) {
  const fields = { 'f-num-clientes': names.length, 'f-asesor': 'MAYA GARCIA', 'f-tipo': 'exclusiva',
    'f-inmueble': 'Calle Prueba 50', 'f-fecha': '2026-10-01', 'f-domicilio': addresses[0] };
  names.forEach((name, i) => { fields['f-cliente' + i] = name; fields['f-domicilio-cliente' + i] = addresses[i]; });
  const raw = {};
  const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const context = vm.createContext({ LOGO_B64: '', escapeHtml, leerMonto: () => amount, renderPaginated() {},
    document: { getElementById: (id) => id === 'contrato-raw' ? raw : { value: fields[id] || '' } },
  });
  vm.runInContext(html.slice(html.indexOf('function numeroALetra('), html.indexOf('function numeroDesdeMonto(')), context);
  vm.runInContext(html.slice(html.indexOf('function formatFechaLarga('), html.indexOf('// ── Generar dinámicamente')), context);
  vm.runInContext(html.slice(html.indexOf('function updatePreview('), html.indexOf('// ── Nombre de archivo sugerido')), context);
  context.updatePreview();
  return raw.innerHTML;
}

test('rental agreement identifies every landlord and their own notification address', () => {
  const output = preview(['ANA CLIENTE', 'LUIS CLIENTE'], ['c 8 DE MAYO 12 COL LOMAS 14735', 'Calle Segunda 25 03100']);
  assert.match(output, /ANA CLIENTE y LUIS CLIENTE/);
  assert.match(output, /A QUIENES EN CONJUNTO/);
  assert.match(output, /ARRENDADOR 1:[\s\S]*C 8 DE MAYO 12 COL LOMAS, C.P. 14735/);
  assert.match(output, /ARRENDADOR 2:[\s\S]*CALLE SEGUNDA 25, C.P. 03100/);
  assert.equal((output.match(/ANA CLIENTE/g) || []).length, 3);
  assert.equal((output.match(/LUIS CLIENTE/g) || []).length, 3);
});

test('rental clauses avoid duplicated currency, inconsistent definitions and invisible list markers', () => {
  const output = preview(['CLIENTE <PRUEBA>'], ['DOMICILIO 123 03100'], 27000.5);
  assert.match(output, /VEINTISIETE MIL PESOS 50\/100 M.N./);
  assert.ok(!output.includes('pesos 00/100'));
  assert.ok(!output.includes('al "PROFESIONAL"'));
  assert.ok(!output.includes('SAPI DE CV'));
  assert.ok(!output.includes('el Inmueble'));
  for (let i = 1; i <= 7; i++) assert.ok(output.includes('class="doc-p">' + i + '.'));
  assert.match(output, /120 días naturales, contado a partir del 1 de octubre de 2026/);
  assert.match(output, /CLIENTE &lt;PRUEBA&gt;/);
  assert.match(output, /MCA KW PREMIER/);
  const withPostalLabel = preview(['CLIENTE'], ['CALLE PRUEBA, C.P. 03100']);
  assert.ok(!withPostalLabel.includes('C.P., C.P.'));
});

test('new landlord addresses are saved and reopened while legacy first address stays compatible', () => {
  assert.match(html, /datos\.domiciliosClientes = Array\.from/);
  assert.match(html, /datos\.domiciliosClientes \|\| \[\]/);
  assert.match(html, /i === 0 \? 'f-domicilio' : 'f-domicilio-cliente'/);
});
