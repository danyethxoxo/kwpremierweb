import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = fs.readFileSync(new URL('../supabase/functions/firmar-documento/index.ts', import.meta.url), 'utf8');
const validation = source.slice(source.indexOf('function limpiarFirmantes('), source.indexOf('// Los observadores solo ven'));
const validar = new Function('RE_CORREO', 'VERIFICACIONES', stripTypeScriptTypes(validation) + '; return limpiarFirmantes;')(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, ['id', 'face', 'ocr', 'face_login']);
const inicio = source.indexOf("    if (accion === 'enviar')");
const fin = source.indexOf("    if (accion === 'guardar_borrador')", inicio);
const bloque = stripTypeScriptTypes(`async function enviarPrueba() {
  const accion='enviar', userId='usuario', WEETRUST_AMBIENTE='produccion';
  const respond=(body,status=200)=>({body,status});
  const obtenerToken=async ()=>'token';
  const limpiarPosiciones=()=>[], limpiarObservadores=()=>[];
  ${source.slice(inicio, fin)}
}`);
const ejecutar = new Function('admin', 'body', 'subirDocumento', 'enviarAFirma', 'pedirDocumento', 'fijarFirmas', 'limpiarFirmantes', `${bloque}; return enviarPrueba();`);

function escenario(previo = null) {
  const cambios = [];
  let inserts = 0;
  const admin = {
    rpc: async () => ({ data: { sin_tope: true } }),
    from() {
      return {
        select() { return this; }, eq() { return this; },
        insert(datos) { inserts++; cambios.push(datos); return this; },
        update(datos) { cambios.push(datos); return this; },
        single: async () => ({ data: previo || { id: 'nuevo' } }),
      };
    },
    storage: { from() { return { download: async () => ({ data: new Blob(['%PDF-1.7'], { type: 'application/pdf' }) }) }; } },
  };
  return { admin, cambios, inserts: () => inserts };
}
const body = { archivoRuta: 'usuario/documento.pdf', nombreArchivo: 'documento.pdf', titulo: 'Contrato', firmantes: [{ nombre: 'Ana López', correo: 'ana@ejemplo.com' }] };

test('rechaza nombres cortos antes de crear documentos o llamar a WeeTrust', async () => {
  const e = escenario();
  const r = await ejecutar(e.admin, { ...body, firmantes: [{ nombre: 'OP', correo: 'op@ejemplo.com' }] }, () => assert.fail('no debe subir'), () => assert.fail('no debe enviar'), () => null, () => {}, validar);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /4 a 100/);
  assert.equal(e.inserts(), 0);
});

test('un rechazo al subir conserva el PDF y devuelve un borrador recuperable con mensaje seguro', async () => {
  const e = escenario();
  const r = await ejecutar(e.admin, body, async () => { throw Error('Subir el documento falló (500): Unable to add document.'); }, () => assert.fail('no debe enviar'), () => null, () => {}, validar);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.recuperable, true);
  assert.equal(r.body.id, 'nuevo');
  assert.match(r.body.error, /WeeTrust no pudo recibir el PDF/);
  assert.doesNotMatch(r.body.error, /Unable|500/);
  assert.equal(e.cambios.at(-1).estado, 'borrador');
});

test('reintenta el mismo expediente sin volver a subir el documento que ya existe como borrador', async () => {
  const e = escenario({ id: 'borrador', user_id: 'usuario', estado: 'borrador', archivo_ruta: body.archivoRuta, weetrust_document_id: 'externo' });
  let enviado = 0;
  const r = await ejecutar(e.admin, { ...body, borradorId: 'borrador' }, () => assert.fail('no debe duplicar PDF'), async () => { enviado++; return { signatory: [] }; }, async () => ({ status: 'DRAFT' }), () => {}, validar);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.id, 'borrador');
  assert.equal(enviado, 1);
  assert.equal(e.inserts(), 0);
});

test('no repite invitaciones si WeeTrust indica que el documento ya está pendiente', async () => {
  const e = escenario({ id: 'borrador', user_id: 'usuario', estado: 'borrador', archivo_ruta: body.archivoRuta, weetrust_document_id: 'externo' });
  const r = await ejecutar(e.admin, { ...body, borradorId: 'borrador' }, () => assert.fail('no debe subir'), () => assert.fail('no debe invitar'), async () => ({ status: 'PENDING' }), () => {}, validar);
  assert.equal(r.status, 409);
});

test('un corte al invitar conserva estado incierto para no habilitar reenvíos duplicados', async () => {
  const e = escenario();
  const r = await ejecutar(e.admin, body, async () => ({ documentID: 'externo' }), async () => { throw Error('Failed to fetch'); }, () => null, () => {}, validar);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.recuperable, false);
  assert.match(r.body.error, /No se pudo confirmar/);
  assert.equal(e.cambios.at(-1).estado, 'error');
});
