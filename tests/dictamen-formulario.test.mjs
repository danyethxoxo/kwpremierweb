import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../hub/dictamenes.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function funcion(nombre) {
  const inicio = html.search(new RegExp('^  (?:async )?function ' + nombre + '\\(', 'm'));
  assert.ok(inicio >= 0);
  return html.slice(inicio, html.indexOf('\n  }', inicio) + 4);
}
const campos = html.slice(html.indexOf('  var CAMPOS = ['), html.indexOf('\n  var CAMPOS_CORRECCION'));

test('guardar restaura la etiqueta visible y conserva el icono en todas las salidas', async () => {
  const inicio = html.indexOf("  $('e-guardar').addEventListener('click', async function () {");
  const listener = html.slice(inicio, html.indexOf('\n  });', inicio) + 6);
  for (const conEtiqueta of [true, false]) {
    for (const resultado of ['exito', 'cancelar', 'validacion', 'error', 'estatus']) {
      let pulsar;
      let etiqueta = conEtiqueta ? {textContent: 'Guardar'} : null;
      const icono = conEtiqueta ? {} : null;
      let iconoActual = icono;
      let texto = 'Guardar';
      const boton = {
        disabled: false,
        querySelector: () => etiqueta,
        addEventListener: (_evento, callback) => { pulsar = callback; },
        get textContent() { return etiqueta ? etiqueta.textContent : texto; },
        set textContent(valor) { texto = valor; etiqueta = null; iconoActual = null; },
      };
      let cierres = 0;
      const contexto = vm.createContext({
        $: () => boton, borrador: {id: 'dictamen'},
        dictamenes: [{id: 'dictamen'}], asesores: [],
        leerEditor() {},
        preguntarEstado: async () => resultado === 'cancelar' ? null : {estado: 'autorizada'},
        guardar: async () => {
          assert.equal(boton.textContent, 'Guardando...');
          if (resultado === 'error') throw new Error('sin conexion');
          return resultado === 'validacion' ? null : 'dictamen';
        },
        window: {
          kwUI: {cargando: () => () => { cierres++; }},
          kwSupabase: {rpc: async () => ({error: resultado === 'estatus' ? {message: 'fallo'} : null})},
        },
        async cargar() {}, activarAccionesDictamen() {}, async fallo() {},
        aviso() {}, mostrarDictamenGuardado() {},
      });
      vm.runInContext(listener, contexto);
      await pulsar();
      assert.equal(boton.disabled, false, resultado);
      assert.equal(boton.textContent, 'Guardar', resultado);
      assert.equal(iconoActual, icono, resultado);
      assert.equal(cierres, resultado === 'cancelar' ? 0 : 1, resultado);
    }
  }
});

test('los dos folios se guardan por separado; No elimina solo los datos del condominio', async () => {
  for (const condominio of ['si', 'no', '']) {
    const elementos = new Map();
    const elemento = id => {
      if (!elementos.has(id)) elementos.set(id, {value: '', style: {}});
      return elementos.get(id);
    };
    elemento('e-condominio').value = condominio;
    elemento('e-folio-real').value = 'INM-001';
    elemento('e-condominio-folio-real').value = 'COND-002';
    elemento('e-esc-condominio').value = 'Escritura 003';
    let guardado;
    const contexto = vm.createContext({
      $: elemento,
      borrador: {clientes: [], observaciones_base: '', correcciones: {}},
      yo: {id: 'usuario'}, hoy: () => '2026-10-26',
      sincronizarFechaEscritura() {}, sincronizarFechaCondominio() {}, leerClientes() {},
      limpiar: (_campo, valor) => valor, cuantosClientes: () => 0,
      resolverTipo: async () => null, juntarCorrecciones: () => '',
      guardarPuntosDe: async () => null,
      window: {kwSupabase: {from(tabla) {
        assert.equal(tabla, 'dictamenes');
        return {insert(fila) {
          guardado = fila;
          return {select: () => ({single: async () => ({data: {id: 'nuevo'}})})};
        }};
      }}},
      ponerFechaCondominio() {},
    });
    vm.runInContext(campos + '\n' + ['leerEditor', 'guardar', 'acomodarCondominio'].map(funcion).join('\n'), contexto);
    contexto.acomodarCondominio();
    assert.equal(elemento('e-esc-condominio-caja').style.display, condominio === 'si' ? 'contents' : 'none');
    assert.equal(await contexto.guardar(), 'nuevo');
    assert.equal(guardado.folio_real, 'INM-001');
    assert.equal(guardado.condominio_folio_real, condominio === 'si' ? 'COND-002' : null);
    assert.equal(guardado.escritura_condominio, condominio === 'si' ? 'Escritura 003' : null);
  }
});
