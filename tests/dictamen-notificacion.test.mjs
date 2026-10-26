import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {PGlite} from '@electric-sql/pglite';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const shared = read('supabase/functions/_shared/dictamen-email.ts');
const js = s => stripTypeScriptTypes(s.replace(/^import .*\n/gm, '').replace(/^export /gm, ''));
function plantilla() {
  const ctx = vm.createContext({TextDecoder, Uint8Array, escaparHtml: v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});
  vm.runInContext(js(read('supabase/functions/_shared/email-utf8.ts')) + '\n' + js(shared), ctx);
  return ctx;
}
const mensaje = 'Hola: María López, te compartimos el dictamen de expediente de tu listado con dirección:\n\nAv. Juárez 12';

test('aviso comparte asunto y estructura con el correo PDF sin anunciar adjuntos', () => {
  const ctx = plantilla();
  for (const [estado, estatus] of [['autorizada','Autorizado'],['condicionada','Autorizado condicionado'],['devuelta','Devuelto']]) {
    const original = ctx.correoDictamen('María López', 'Av. Juárez 12', estado);
    const aviso = ctx.correoNotificacionDictamen('dictamen', 'Dictamen de expediente: ' + estatus, mensaje);
    assert.equal(aviso.asunto, original.asunto);
    assert.equal((aviso.html.match(/<h1/g) || []).length, 1);
    assert.ok(aviso.html.includes('Ver dictámenes'));
    assert.ok(aviso.html.includes('María López'));
    assert.ok(aviso.html.includes('Av. Juárez 12'));
    assert.equal(/PDF|adjuntamos|Incluye un/.test(aviso.html), false);
    assert.ok(original.html.includes('Incluye un PDF'));
    assert.deepEqual(Object.keys(aviso).sort(), ['asunto','html']);
  }
  assert.equal(ctx.correoNotificacionDictamen('ticket', 'Dictamen de expediente: Autorizado', mensaje), null);
  assert.equal(ctx.correoNotificacionDictamen('dictamen', 'Dictamen actualizado', 'Revisa los cambios'), null);
  const legacy = ctx.correoNotificacionDictamen('dictamen', 'Autorizado para promociÃ³n: Av. Juárez 12', 'Expediente de María López. Folio D-1.');
  assert.equal(legacy.asunto, 'Dictamen de expediente: Autorizado');
  assert.ok(legacy.html.includes('Av. Juárez 12'));
  assert.ok(ctx.correoDictamen('<script>alert(1)</script>', '<img src=x>', 'autorizada', false).html.includes('&lt;img src=x&gt;'));
});

test('webhook envia el asunto compartido sin adjuntos y mantiene otros avisos', async () => {
  const helper = plantilla();
  for (const tipo of ['dictamen','ticket']) {
    let handler, enviado;
    const aviso = {user_id:'usuario', tipo, titulo:tipo === 'dictamen' ? 'Dictamen de expediente: Autorizado' : 'Ticket recibido',mensaje,url:'/hub/dictamenes.html'};
    const ctx = vm.createContext({Response,Request,Date, console,
      Deno:{env:{get:()=>'configurado'}},
      secureServe:(_opciones, fn)=>{handler=fn;},
      correoNotificacionDictamen:helper.correoNotificacionDictamen,
      prepararCorreoUtf8:v=>v, plantillaCorreo:p=>'OTRO:'+p.title,
      createClient:()=>({from:tabla=>({select(){return this;},eq(){return this;},single:async()=>({data:tabla==='notificaciones'?aviso:{nombre:'Receptor',email:'test@example.com'}})})}),
      fetch:async(_url, init)=>{enviado=JSON.parse(init.body);return new Response(JSON.stringify({id:'test'}));},
    });
    vm.runInContext(js(process.env.KW_NOTIFICAR_EMAIL_SOURCE ? fs.readFileSync(process.env.KW_NOTIFICAR_EMAIL_SOURCE, 'utf8') : read('supabase/functions/notificar-email/index.ts')), ctx);
    const res = await handler(new Request('https://example.com', {method:'POST',headers:{'x-webhook-secret':'configurado'},body:JSON.stringify({record:{...aviso,notificacion_id:'11111111-1111-4111-8111-111111111111'}})}));
    assert.equal(res.status,200);
    assert.equal(enviado.subject,aviso.titulo);
    assert.equal('attachments' in enviado,false);
    assert.equal(enviado.html.includes('Ver dictámenes'),tipo==='dictamen');
  }
});

test('trigger genera asunto y mensaje nuevos sin cambiar destinatarios ni duplicar al mismo estatus', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;
      create table profiles(id uuid, role text);
      create table dictamen_asesores(id uuid, nombre text);
      create table dictamenes(id uuid, asesor_id uuid, estado text, inmueble text);
      create table notificaciones(user_id uuid,tipo text,titulo text,mensaje text,url text);
      insert into profiles values ('11111111-1111-4111-8111-111111111111','admin'),('22222222-2222-4222-8222-222222222222','staff'),('33333333-3333-4333-8333-333333333333','asesor');
      insert into dictamen_asesores values ('44444444-4444-4444-8444-444444444444','María López');
      insert into dictamenes values ('55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444','borrador','Av. Juárez 12');`);
    await db.exec(read('supabase/sql/127_dictamen_notificacion_correo.sql'));
    await db.exec('create trigger aviso after update on dictamenes for each row execute function notificar_dictamen();');
    await db.exec("update dictamenes set estado='autorizada'; update dictamenes set estado='autorizada';");
    const rows=(await db.query('select * from notificaciones')).rows;
    assert.equal(rows.length,1);
    assert.equal(rows[0].titulo,'Dictamen de expediente: Autorizado');
    assert.equal(rows[0].mensaje,mensaje);
    assert.equal(rows[0].user_id,'22222222-2222-4222-8222-222222222222');
    assert.equal(rows[0].url,'/hub/dictamenes.html');
  } finally {await db.close();}
});
