import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHTML } from 'linkedom';

const source = fs.readFileSync(new URL('../supabase/functions/perfil-sitio-kw/profile.ts', import.meta.url), 'utf8');
const { stripTypeScriptTypes } = await import('node:module');
const js = stripTypeScriptTypes(source.replace(/^import .*$/m, ''), { mode: 'transform' })
  .replace(/export /g, '');
const { sitioKW, extraerPerfil } = new Function('parseHTML', js + '\nreturn { sitioKW, extraerPerfil };')(parseHTML);

test('KW profile accepts only a single advisor subdomain and fixes the about route', () => {
  assert.equal(sitioKW('DaniGuerrero.kw.com/es-419/about'), 'https://daniguerrero.kw.com');
  for (const input of ['https://evil.com', 'https://a.kw.com.evil.com', 'https://a.kw.com:8080', 'https://user@a.kw.com', 'http://a.kw.com']) {
    assert.throws(() => sitioKW(input));
  }
});

test('technical sheet takes each website profile without mixing two advisors', () => {
  for (const name of ['Ana Perez', 'Luis Garcia']) {
    const person = { '@type': 'Person', name, email: name.split(' ')[0] + '@kw.com', telephone: '+52 5512345678', image: 'https://images.kw.com/person.jpg' };
    const html = '<script type="application/ld+json">' + JSON.stringify(person) + '</script><h1>About Me</h1>';
    const profile = extraerPerfil(html, 'https://ana.kw.com');
    assert.equal(profile.nombre, name);
    assert.equal(profile.email, person.email);
    assert.equal(profile.foto_url, person.image);
    assert.equal(profile.puesto, 'Asesor Inmobiliario');
  }
});

test('technical sheet reads visible name, contact links and matching advisor photograph', () => {
  const profile = extraerPerfil('<h1>Ana Perez</h1><img alt="Ana Perez" src="/ana.jpg"><a href="mailto:ana@kw.com">Email</a><a href="tel:+525512345678">Phone</a>', 'https://ana.kw.com');
  assert.equal(profile.foto_url, 'https://ana.kw.com/ana.jpg');
  assert.equal(profile.whatsapp, '+525512345678');
});

test('verification pages and incomplete website responses never become advisor data', () => {
  assert.throws(() => extraerPerfil('<h1>Just a moment...</h1>', 'https://ana.kw.com'));
  assert.throws(() => extraerPerfil('<h1>About Me</h1><a href="mailto:office@kw.com">Email</a>', 'https://ana.kw.com'));
});
