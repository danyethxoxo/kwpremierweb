import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const leer = ruta => fs.readFileSync(new URL('../' + ruta, import.meta.url), 'utf8');
const motor = leer('assets/js/kw-busqueda-portal.js');
function entorno(datos = {}) {
  const contexto = vm.createContext(datos);
  vm.runInContext('window = globalThis', contexto);
  vm.runInContext(motor, contexto);
  return contexto;
}
function funciones(contexto, ruta, nombres) {
  const html = leer(ruta);
  for (const nombre of nombres) {
    const inicio = html.indexOf('  function ' + nombre + '(');
    assert.ok(inicio >= 0, nombre);
    vm.runInContext(html.slice(inicio, html.indexOf('\n  }', inicio) + 4), contexto);
  }
}

test('reconoce nombres parciales, dedazos y términos en distinto orden sin corregir folios ni correos', () => {
  const { preparar } = entorno().kwBusquedaPortal;
  const campos = ['Contrato de renta', 'Adriana García'];
  const exactos = ['KW-1234', 'adriana@correo.mx'];
  assert.ok(preparar('garcia adri').coincide(campos, exactos));
  assert.ok(preparar('renta de Adriana garcai').coincide(campos, exactos));
  assert.ok(preparar('renta de rodrgio').coincide('Arrendamiento_Rodrigo_2026.pdf'));
  assert.ok(preparar('kw-1234').coincide(campos, exactos));
  assert.ok(!preparar('KW-1235').coincide(campos, exactos));
  assert.ok(!preparar('adrianna@correo.mx').coincide(campos, exactos));
  assert.ok(!preparar('renta de Rodrigo').coincide(campos, exactos));
  assert.ok(preparar('renta').puntuar(campos) < preparar('renat').puntuar(campos));
});

test('Firmas combina documento, estado y firmante y respeta el filtro de la lista', () => {
  const fila = { id: 'uno', titulo: 'Arrendamiento', estado: 'pendiente',
    firmantes: [{ nombre: 'María Pérez', correo: 'maria@correo.mx' }] };
  const contexto = entorno({
    envios: [fila, { ...fila, id: 'dos', estado: 'completado' }],
    buscaAsesor: 'firmas pendinete de Marai', miUserId: 'usuario', miPerfil: {},
    etiquetas: [], filtro: 'todos', etiqueta: null, desde: null, hasta: null,
    faltaFirma: null, orden: 'fecha-desc', ORDENES: { 'fecha-desc': () => 0 },
  });
  funciones(contexto, 'hub/firmas.html', ['nombreDoc', 'normalizarBusquedaFirmas', 'textoBusquedaEnvio', 'envíosFiltrados']);
  assert.equal(vm.runInContext('envíosFiltrados().map(e => e.id).join(",")', contexto), 'uno');
  contexto.filtro = 'completado';
  assert.equal(vm.runInContext('envíosFiltrados().length', contexto), 0);
});

test('Dictámenes combina estado y asesor, con filtros de archivo y folio vigentes', () => {
  const campos = { 'f-buscar': 'dictámenes aprobados de Adiriana' };
  const fila = { folio: 'D-1234', estado: 'autorizada', asesor_nombre: 'Adriana García' };
  const contexto = entorno({
    $: id => ({ value: campos[id] ?? (id.includes('precio') || id.includes('comision') || id.includes('desde') || id.includes('hasta') ? '' : 'todos') }),
    dictamenes: [fila, { ...fila, folio: 'D-1235', archivado_at: '2026-11-10' },
      { ...fila, folio: 'D-1236', estado: 'devuelta' }],
    verArchivo: false, estadoFiltro: 'todos', soloCifra: v => v, fueraDeRango: () => false,
    ESTADOS: { autorizada: 'Aprobado', devuelta: 'Devuelto' }, OPERACIONES: {}, CONTRATOS: {},
  });
  funciones(contexto, 'hub/dictamenes.html', ['visibles']);
  assert.equal(vm.runInContext('visibles().map(d => d.folio).join(",")', contexto), 'D-1234');
  campos['f-buscar'] = 'D-1239';
  assert.equal(vm.runInContext('visibles().length', contexto), 0);
});

test('Máster encuentra todas las coincidencias del nombre y acota con el apellido', () => {
  const contexto = entorno({ consulta: 'adriana', grupo: { titulo: 'Activos', personas: [
    { nombre: 'Adriana García', kwid: '1000' }, { nombre: 'Adriana Pérez', kwid: '1001' },
    { nombre: 'Rodrigo García', kwid: '1002' }, { nombre: 'Adriano García', kwid: '1003' },
  ] } });
  vm.runInContext("document = { getElementById: () => ({ value: consulta }) }", contexto);
  funciones(contexto, 'hub/admin.html', ['filtroBuscador', 'coincide', 'visiblesDe']);
  assert.equal(vm.runInContext('visiblesDe(grupo).length', contexto), 2);
  contexto.consulta = 'asesores activos de adriana garcai';
  assert.equal(vm.runInContext('visiblesDe(grupo).map(p => p.kwid).join(",")', contexto), '1000');
});
