// Smoke test read-only para el dominio publicado y el gateway de Supabase.
// No crea usuarios, no escribe datos y nunca imprime llaves ni respuestas de negocio.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = String(process.env.KW_SITE_URL || 'https://www.kwpremieroficial.com').replace(/\/$/, '');
const SITE_ORIGIN = new URL(SITE_URL).origin;
const SOURCE_SECURITY = readFileSync(resolve(ROOT, 'assets/js/kw-security.js'), 'utf8');
const SOURCE_LOGIN = readFileSync(resolve(ROOT, 'login.html'), 'utf8');
const SUPABASE_URL = String(
  process.env.SUPABASE_URL || SOURCE_SECURITY.match(/API_ORIGIN\s*=\s*['"]([^'"]+)/)?.[1] || ''
).replace(/\/$/, '');
const PUBLIC_KEY = String(
  process.env.SUPABASE_PUBLIC_KEY || SOURCE_LOGIN.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0] || ''
);

if (!/^https:\/\//i.test(SITE_URL)) throw new Error('KW_SITE_URL debe usar HTTPS.');
if (!/^https:\/\/[^/]+\.supabase\.co$/i.test(SUPABASE_URL)) {
  throw new Error('SUPABASE_URL no tiene un dominio Supabase valido.');
}
if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(PUBLIC_KEY)) {
  throw new Error('No se encontro una llave publica sb_publishable_ en la configuracion.');
}

const failures = [];
const passes = [];

function check(name, ok, detail) {
  const line = `${ok ? '[OK]' : '[FALTA]'} ${name}${detail ? `: ${detail}` : ''}`;
  console.log(line);
  (ok ? passes : failures).push(line);
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      ...options,
      signal: controller.signal,
    });
    const body = await response.text();
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

async function probe(name, fn) {
  try {
    await fn();
  } catch (error) {
    check(name, false, error?.name === 'AbortError' ? 'tiempo de espera agotado' : 'no se pudo consultar');
  }
}

console.log(`Verificacion de produccion: ${SITE_ORIGIN}`);
console.log(`Gateway: ${SUPABASE_URL}/functions/v1/data-gateway`);
console.log('Solo se ejecutan lecturas y preflight CORS.\n');

await probe('sitio responde por HTTPS', async () => {
  const { response, body } = await request(`${SITE_URL}/`, { headers: { accept: 'text/html' } });
  check('sitio responde por HTTPS', response.status === 200, `HTTP ${response.status}`);
  check('la portada entrega HTML', /<html[\s>]/i.test(body) && /KW Premier/i.test(body), 'contenido HTML presente');

  const required = [
    ['Strict-Transport-Security', (value) => /^max-age=31536000(?:;|$)/i.test(value || '')],
    ['X-Content-Type-Options', (value) => value?.toLowerCase() === 'nosniff'],
    ['Referrer-Policy', (value) => value === 'strict-origin-when-cross-origin'],
    ['Permissions-Policy', (value) => Boolean(value)],
    ['X-Frame-Options', (value) => value?.toUpperCase() === 'SAMEORIGIN'],
    ['X-Permitted-Cross-Domain-Policies', (value) => value?.toLowerCase() === 'none'],
    ['Cross-Origin-Resource-Policy', (value) => value?.toLowerCase() === 'same-origin'],
    ['Content-Security-Policy', (value) => /frame-ancestors\s+'self'/i.test(value || '')],
  ];
  for (const [header, valid] of required) check(`header ${header}`, valid(response.headers.get(header)), 'configurado');
  check('la web no expone CORS abierto', !response.headers.has('access-control-allow-origin'), 'sin ACAO en HTML');
});

await probe('HTTP redirige a HTTPS', async () => {
  const host = new URL(SITE_URL).host;
  const { response } = await request(`http://${host}/`, {});
  const location = response.headers.get('location') || '';
  check('HTTP redirige a HTTPS', [301, 302, 307, 308].includes(response.status) && /^https:\/\//i.test(location), `HTTP ${response.status}`);
});

const gatewayUrl = `${SUPABASE_URL}/functions/v1/data-gateway/propiedades_publicas?select=id&limit=1`;
const publicHeaders = { apikey: PUBLIC_KEY, Authorization: `Bearer ${PUBLIC_KEY}` };

await probe('gateway publico responde', async () => {
  const { response } = await request(gatewayUrl, { headers: { ...publicHeaders, Origin: SITE_ORIGIN } });
  check('gateway publico responde', response.status >= 200 && response.status < 300, `HTTP ${response.status}`);
});

await probe('REST directo permanece bloqueado', async () => {
  const directUrl = `${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`;
  const { response } = await request(directUrl, { headers: { ...publicHeaders, Origin: SITE_ORIGIN } });
  check('REST directo permanece bloqueado', response.status < 200 || response.status >= 300, `HTTP ${response.status}`);
});

await probe('token falso no entra al gateway', async () => {
  const { response } = await request(`${SUPABASE_URL}/functions/v1/data-gateway/profiles?select=id&limit=1`, {
    headers: { apikey: PUBLIC_KEY, Authorization: 'Bearer token-falso-de-smoke-test', Origin: SITE_ORIGIN },
  });
  check('token falso no entra al gateway', response.status === 401 || response.status === 403, `HTTP ${response.status}`);
});

await probe('CORS del dominio propio', async () => {
  const { response } = await request(`${SUPABASE_URL}/functions/v1/data-gateway/propiedades_publicas`, {
    method: 'OPTIONS',
    headers: {
      Origin: SITE_ORIGIN,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'apikey,authorization',
    },
  });
  check('preflight del dominio propio acepta GET', [200, 204].includes(response.status), `HTTP ${response.status}`);
  check('CORS devuelve el origen exacto', response.headers.get('access-control-allow-origin') === SITE_ORIGIN, 'origen exacto');
});

await probe('CORS rechaza origen externo', async () => {
  const { response } = await request(`${SUPABASE_URL}/functions/v1/data-gateway/propiedades_publicas`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://sitio-no-autorizado.example',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'apikey,authorization',
    },
  });
  const allowOrigin = response.headers.get('access-control-allow-origin');
  check('CORS rechaza origen externo', response.status >= 400 || !allowOrigin, `HTTP ${response.status}`);
});

console.log(`\nResultado: ${passes.length} correctas, ${failures.length} pendientes.`);
if (failures.length) {
  console.log('No liberar usuarios nuevos hasta resolver las pendientes anteriores.');
  process.exitCode = 1;
}
