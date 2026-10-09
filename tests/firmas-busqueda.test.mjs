import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../hub/firmas.html', import.meta.url), 'utf8');
test('los scripts de Firmas Digitales conservan sintaxis válida', () => {
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!match[1].includes('src=') && match[2].trim()) new vm.Script(match[2]);
  }
});
function funcion(nombre) {
  const start = html.indexOf('  function ' + nombre + '(');
  assert.ok(start >= 0);
  return html.slice(start, html.indexOf('\n  }', start) + 4);
}
function buscar(consulta, cambios = {}) {
  const contexto = vm.createContext({
    envios: [{ id: 'uno', titulo: 'Contrato de arrendamiento', nombre_archivo: 'Casa Polanco.pdf',
      estado: 'pendiente', user_id: 'creador', autor: { nombre: 'José García', email: 'jose@kw.mx' },
      firmantes: [{ nombre: 'María López', correo: 'maria@cliente.mx' }],
      observadores: [{ nombre: 'Ana Pérez', correo: 'ana@revision.mx' }],
      etiquetas: ['urgente'], created_at: '2026-10-09' }],
    buscaAsesor: consulta, miUserId: 'creador', miPerfil: { nombre: 'Pedro Ruiz', correo: 'pedro@kw.mx' },
    etiquetas: [{ id: 'urgente', nombre: 'Revisión urgente' }],
    filtro: 'todos', etiqueta: null, desde: null, hasta: null, faltaFirma: null,
    orden: 'fecha-desc', ORDENES: { 'fecha-desc': () => 0 }, ...cambios,
  });
  vm.runInContext(['nombreDoc', 'normalizarBusquedaFirmas', 'textoBusquedaEnvio', 'envíosFiltrados']
    .map(funcion).join('\n'), contexto);
  return vm.runInContext('envíosFiltrados().map(e => e.id).join(",")', contexto);
}

test('busca por documento, archivo, personas, correos y etiquetas sin acentos ni orden fijo', () => {
  for (const consulta of ['arrendamiento', 'polanco', 'LOPEZ MARIA', 'maria@cliente', 'garcia jose',
    'jose@kw.mx', 'ana perez', 'ana@revision', 'revision urgente', 'polanco maria garcia', '   ']) {
    assert.equal(buscar(consulta), 'uno', consulta);
  }
  assert.equal(buscar('polanco desconocido'), '');
  assert.equal(buscar('noexiste@correo.mx'), '');
});

test('conserva filtros de estado, fecha y etiqueta durante la búsqueda', () => {
  assert.equal(buscar('maria', { filtro: 'completado' }), '');
  assert.equal(buscar('maria', { desde: '2026-10-10' }), '');
  assert.equal(buscar('maria', { etiqueta: 'otra' }), '');
});

test('busca el perfil propio y tolera documentos sin personas', () => {
  const envio = { id: 'uno', user_id: 'creador', titulo: 'Acuerdo', estado: 'borrador' };
  assert.equal(buscar('pedro@kw', { envios: [envio] }), 'uno');
  assert.equal(buscar('ruiz pedro', { envios: [envio] }), 'uno');
  assert.equal(buscar('sin identificar', { envios: [{ ...envio, user_id: 'otro' }] }), 'uno');
  assert.equal(buscar('maria', { envios: [envio] }), '');
});

test('carga documentos posteriores a los primeros 300 sin perder selecciones vigentes', async () => {
  const documentos = Array.from({ length: 301 }, (_, i) => ({ id: String(i), titulo: 'Documento ' + i }));
  const rangos = [];
  const contexto = vm.createContext({
    veTodo: true, envios: [], elegidos: new Set(['300', 'borrado']), pintarEnvios: () => {},
    window: { kwSupabase: { from: () => ({ select() { return this; }, order() { return this; },
      range: async (inicio, fin) => { rangos.push([inicio, fin]); return { data: documentos.slice(inicio, fin + 1), error: null }; },
    }) } },
  });
  const inicio = html.indexOf('  async function cargarEnvios()');
  vm.runInContext(html.slice(inicio, html.indexOf('\n  }', inicio) + 4), contexto);
  await vm.runInContext('cargarEnvios()', contexto);
  assert.equal(contexto.envios.length, 301);
  assert.deepEqual(rangos, [[0, 299], [300, 599]]);
  assert.deepEqual([...contexto.elegidos], ['300']);
});
