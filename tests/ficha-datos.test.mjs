import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/kw-ficha-propiedad.js', import.meta.url), 'utf8');
const window = { location: { href: 'https://www.kwpremieroficial.com/propiedades.html' } };
vm.runInNewContext(source, { window, URL });
const crear = propiedad => window.kwFichaPropiedad.crearModelo({ propiedad });

test('las fichas corrigen los tipos contradictorios de los dos anuncios reportados', () => {
  const terreno = crear({ tipo: 'Oficina', titulo: 'Terreno Comercial, 3 frentes, 350 m2', operacion: 'venta', recamaras: 2, m2_terreno: 200, m2_construccion: 348 });
  assert.equal(terreno.tipo, 'Terreno comercial');
  assert.equal(terreno.tituloRedes, 'Terreno comercial en venta');
  assert.equal(terreno.features[0].etiqueta, 'TERRENO');
  assert.equal(terreno.features[0].valor, '200 m²', 'conserva el valor del campo, sin inventar metros a partir del título');
  assert.equal(terreno.datosDetalle.some(d => d.etiqueta === 'Recámaras'), false, 'no presenta oficinas de un terreno como dormitorios');
  const departamento = crear({ tipo: 'Local comercial', titulo: 'Departamento en La Colonia Condesa - 74 m² con Encanto y Excelentes Acabados', operacion: 'venta' });
  assert.equal(departamento.tipo, 'Departamento');
  assert.equal(departamento.tituloRedes, 'Departamento en venta');
});

test('solo clasifica el inmueble principal y conserva subtipos y usos de terreno', () => {
  const casos = [
    ['Oficina', 'Terreno industrial en venta', 'Terreno industrial'],
    ['Oficina', 'Venta de terreno comercial con oficinas', 'Terreno comercial'],
    ['Casa', 'Casa con oficina y bodega', 'Casa'],
    ['Bodega', 'Oficina con bodega', 'Oficina'],
    ['Oficina', 'Bodega con oficinas', 'Bodega'],
    ['Terreno industrial', 'Terreno en venta', 'Terreno industrial'],
    ['Casa en condominio', 'Casa en venta', 'Casa en condominio'],
    ['Oficina', 'Casa en condominio en renta', 'Casa en condominio'],
    ['Casa', 'Cerca de oficinas y parques', 'Casa'],
    ['Casa', 'Casablanca, excelente oportunidad', 'Casa'],
    ['', 'Excelente oportunidad en Polanco', 'Propiedad'],
    ['Propiedad', 'Se vende departamento en Condesa', 'Departamento'],
    ['Propiedad', 'DEPA EN RENTA', 'Departamento'],
    ['Propiedad', 'Local comercial en venta', 'Local comercial']
  ];
  for (const [tipo, titulo, esperado] of casos) assert.equal(crear({ tipo, titulo }).tipo, esperado, titulo);
});

test('la operación sale de los datos y no se deduce del título ni de listas duplicadas', () => {
  assert.equal(crear({ tipo: 'Casa', titulo: 'Casa en venta', operacion: 'renta' }).tituloRedes, 'Casa en renta');
  assert.equal(crear({ tipo: 'Casa', operacion: 'VENTA' }).tituloRedes, 'Casa en venta');
  assert.equal(crear({ tipo: 'Casa', operaciones_filtro: ['venta', 'renta'] }).tituloRedes, 'Casa en venta y renta');
  assert.equal(crear({ tipo: 'Casa', operaciones_filtro: ['venta', 'venta'] }).tituloRedes, 'Casa en venta');
  assert.equal(crear({ tipo: 'Casa', titulo: 'Casa en venta' }).tituloRedes, 'Casa: operación por confirmar');
});

test('Detalle solo ofrece datos útiles y no fabrica impuestos ni valores ausentes', () => {
  const modelo = crear({ tipo: 'Casa', recamaras: 4, banos: 4, estacionamientos: 0, m2_construccion: 453, m2_terreno: 600, city_tax: 500, land_tax: 200 });
  assert.deepEqual(Array.from(modelo.datosDetalle, d => d.etiqueta), ['Recámaras', 'Baños', 'Construcción', 'Terreno']);
});
