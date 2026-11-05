import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { documentoAusente, estadoSincronizado } from '../supabase/functions/firmar-documento/weetrust-estado.ts';

test('reconoce el 400 de documento ausente sin confundir permisos o validaciones', () => {
  assert.equal(documentoAusente(400, {success:false,message:'Document not found.'}), true);
  assert.equal(documentoAusente(400, {success:false,message:'Invalid token'}), false);
  assert.equal(documentoAusente(403, {success:false,message:'Document not found.'}), false);
  for (const estado of ['completado','eliminado','cancelado']) {
    assert.equal(estadoSincronizado(estado, 'PENDING'), estado);
  }
  assert.equal(estadoSincronizado('pendiente', 'COMPLETED'), 'completado');
});

test('un documento borrado no reaparece por una importación o webhook concurrente', async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create table public.firmas_documentos (weetrust_document_id text, ambiente text);");
    const sql = fs.readFileSync(new URL('../supabase/migrations/20261105171057_firmas_retirados.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    await db.exec("insert into firmas_documentos values ('externo','produccion'); delete from firmas_documentos; insert into firmas_documentos values ('externo','produccion'),('externo','sandbox'),(null,'produccion');");
    assert.equal((await db.query('select * from firmas_documentos_retirados')).rows.length, 1);
    assert.equal((await db.query('select * from firmas_documentos')).rows.length, 2);
    assert.equal((await db.query("select has_table_privilege('authenticated','firmas_documentos_retirados','select') as permiso")).rows[0].permiso, false);
  } finally { await db.close(); }
});
