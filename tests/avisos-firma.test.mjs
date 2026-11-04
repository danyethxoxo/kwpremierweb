import test from 'node:test';
import assert from 'node:assert/strict';
import { mensajeAvanceFirma } from '../supabase/functions/firmar-documento/avisos-firma.ts';
const f = (nombre, firmado = false) => ({ nombre, correo: nombre.toLowerCase() + '@ejemplo.com', firmado });

test('identifica a quien acaba de firmar y cuenta solo las firmas pendientes', () => {
  const previos = [f('Ana'), f('Luis'), f('Eva'), f('José')];
  const actuales = [f('Ana', true), f('Luis'), f('Eva'), f('José')];
  assert.equal(mensajeAvanceFirma(previos, actuales, 'Compraventa'), 'Ana ya firmó el contrato "Compraventa". Aún faltan 3 firmas.');
  assert.equal(mensajeAvanceFirma(actuales, [f('Ana', true), f('Luis', true), f('Eva', true), f('José')], 'Compraventa'), 'Luis y Eva ya firmaron el contrato "Compraventa". Aún falta 1 firma.');
});

test('los reintentos no repiten avances y la última firma informa el cierre', () => {
  const previos = [f('Ana', true), f('Luis')];
  assert.equal(mensajeAvanceFirma(previos, previos, 'Renta'), null);
  assert.equal(mensajeAvanceFirma(previos, [f('Ana', true), f('Luis', true)], 'Renta', true), 'Luis ya firmó el contrato "Renta". Todas las firmas están completas.');
  assert.equal(mensajeAvanceFirma([], [], 'Renta', true), 'El contrato "Renta" ya fue firmado por todas las partes. Todas las firmas están completas.');
});

test('reconoce al mismo firmante aunque cambie el formato del correo', () => {
  assert.equal(mensajeAvanceFirma([{ nombre: 'Ana', correo: ' ANA@EJEMPLO.COM ', firmado: true }], [f('Ana', true)], 'Renta'), null);
});
