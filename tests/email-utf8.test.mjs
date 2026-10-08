import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTextoCorreo, prepararCorreoUtf8 } from '../supabase/functions/_shared/email-utf8.ts';

test('repara el aviso real y conserva Unicode correcto', () => {
  assert.equal(normalizarTextoCorreo('Nuevo inicio de sesiÃ³n'), 'Nuevo inicio de sesión');
  assert.equal(normalizarTextoCorreo('Se iniciÃ³ una sesiÃ³n en Ciudad de MÃ©xico; contraseÃ±a.'), 'Se inició una sesión en Ciudad de México; contraseña.');
  for (const text of ['á é í ó ú ñ ¿Qué? ¡Hola!', 'México', 'María', '😀', '中文', 'â', 'Ã']) {
    assert.equal(normalizarTextoCorreo(text), text);
  }
  assert.equal(normalizarTextoCorreo('â€™ â€œ â€\u009d'), '’ “ ”');
});

test('normaliza asunto y ambas versiones sin alterar destino ni adjuntos', () => {
  const attachments = [{ filename: 'dictamen.pdf', content: 'AQID' }];
  const result = prepararCorreoUtf8({ to: ['test@example.com'], subject: 'sesiÃ³n', html: '<p>MÃ©xico</p>', text: 'contraseÃ±a', attachments });
  assert.equal(result.subject, 'sesión');
  assert.match(result.html, /<meta charset="utf-8">/);
  assert.match(result.html, /<p>México<\/p>/);
  assert.equal(result.text, 'contraseña');
  assert.equal(result.attachments, attachments);
  assert.deepEqual(result.to, ['test@example.com']);
  assert.deepEqual(prepararCorreoUtf8(result), result);
});
