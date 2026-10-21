import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const window = {};
vm.runInNewContext(fs.readFileSync(new URL('../assets/js/kw-firma-puente.js', import.meta.url), 'utf8'), { window });
const detectar = datos => JSON.parse(JSON.stringify(window.kwFirmaPuente.detectarFirmantes(datos)));

test('asocia nombres y correos del referido sin cruzar recibe y envía', () => {
  assert.deepEqual(detectar({ 'f-asesor-recibe': 'Ana Pérez', 'f-correo-recibe': 'ANA@EJEMPLO.COM', 'f-asesor-envia': 'Luis García', 'f-correo-envia': 'luis@ejemplo.com', 'f-mc-envia': 'KW PREMIER', 'f-comprador-nombre': 'Carlos', 'f-comprador-correo': 'carlos@ejemplo.com' }), [
    { nombre: 'Ana Pérez', correo: 'ana@ejemplo.com' }, { nombre: 'Luis García', correo: 'luis@ejemplo.com' }, { nombre: 'Carlos', correo: 'carlos@ejemplo.com' }
  ]);
});
test('detecta clientes múltiples de Comercial y Profeco, y nombres sin correo de Renta', () => {
  assert.deepEqual(detectar({ 'com-cliente': 'Ana', 'com-correo_cliente': 'ana@ejemplo.com', 'com-cliente_2': 'Luis', 'com-correo_cliente_2': 'luis@ejemplo.com', 'f-cli0-nombre': 'Eva', 'f-cli0-correo': 'eva@ejemplo.com', 'f-cliente0': 'María', 'f-domicilio-cliente0': 'Una calle' }), [
    { nombre: 'Ana', correo: 'ana@ejemplo.com' }, { nombre: 'Luis', correo: 'luis@ejemplo.com' }, { nombre: 'Eva', correo: 'eva@ejemplo.com' }, { nombre: 'María', correo: '' }
  ]);
});
test('lee datos guardados, no inventa correos y deduplica personas', () => {
  assert.deepEqual(detectar({ asesor: 'Ana', correo_asesor: 'ana@ejemplo.com', clientes: [{ cliente: 'Ana', correo_cliente: 'ANA@EJEMPLO.COM' }, { cliente: 'Luis', correo_cliente: 'mal correo' }] }), [{ nombre: 'Ana', correo: 'ana@ejemplo.com' }, { nombre: 'Luis', correo: '' }]);
});
