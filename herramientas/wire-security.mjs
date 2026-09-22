// Idempotent mechanical wiring for the security rollout. No credentials.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1');
// Remove obsolete in-source webhook secrets without printing their values.
for (const [name, vaultName] of [['029_correo_prospecto.sql', 'kw_sync_secret'], ['036_notificar_email_trigger.sql', 'kw_webhook_secret'], ['038_notificar_email_jwt.sql', 'kw_webhook_secret']]) {
  const file = join(root, 'supabase/sql', name);
  let sql = readFileSync(file, 'utf8');
  if (/v_secreto text := '[^']+';/.test(sql)) {
    sql = sql.replace(/v_secreto text := '[^']+';/, 'v_secreto text;');
    sql = sql.replace(/\nbegin\r?\n/, `\nbegin\n  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = '${vaultName}' limit 1;\n  if v_secreto is null then raise exception 'Falta ${vaultName} en Vault'; end if;\n`);
    writeFileSync(file, sql);
  }
}
const plans = {
  'gestionar-usuario': "userLimit: 20",
  'invitar-usuario': "userLimit: 10",
  'firmar-documento': "userLimit: 60, maxBytes: 30 * 1024 * 1024",
  'enviar-dictamen-email': "userLimit: 10, maxBytes: 20 * 1024 * 1024",
  'proceso-alta': "userLimit: 60",
  'notificar-incidencia-email': "userLimit: 10",
  'mfa-correo': "mfa: false, userLimit: 30",
  'calendar-events': "methods: ['GET', 'POST'], auth: 'user'",
  'api-propiedades': "methods: ['GET', 'POST', 'DELETE'], auth: (req) => /\\/llaves(?:\\/|$)/.test(new URL(req.url).pathname) ? 'user' : 'service', maxBytes: 4 * 1024 * 1024",
  'sincronizar-propiedades': "auth: (req) => Deno.env.get('SYNC_SECRET') && req.headers.get('x-sync-secret') === Deno.env.get('SYNC_SECRET') ? 'service' : 'user', maxBytes: 8 * 1024 * 1024, json: false",
  'avisar-prospecto': "auth: 'service', ipLimit: 60",
  'notificar-email': "auth: 'service', ipLimit: 120",
  'weetrust-webhook': "auth: 'service', ipLimit: 120, maxBytes: 65536, json: false",
};
for (const [name, options] of Object.entries(plans)) {
  const file = join(root, 'supabase/functions', name, 'index.ts');
  let code = readFileSync(file, 'utf8');
  code = code.replaceAll('@supabase/supabase-js@2\'', '@supabase/supabase-js@2.117.0\'')
    .replaceAll('@supabase/supabase-js@2"', '@supabase/supabase-js@2.117.0"')
    .replaceAll('fast-xml-parser@4.3.6', 'fast-xml-parser@5.11.1')
    .replaceAll('ReturnType<typeof createClient>', 'ReturnType<typeof createClient<any>>')
    .replaceAll("const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!", "const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!");
  if (code.includes('Deno.serve(')) {
    code = `import { secureServe } from '../_shared/security.ts'\n` + code;
    code = code.replace('Deno.serve(', `secureServe({ name: '${name}', ${options} }, `);
    code = code.replace(/const (CORS_HEADERS|corsHeaders) = \{[\s\S]*?\n\}/, 'const $1 = {}');
    code = code.replace(/const ALLOWED_ORIGINS = [\s\S]*?\.filter\(Boolean\)\r?\n/, '');
    code = code.replace(/function cors\(req: Request\) \{[\s\S]*?\n\}/, 'function cors(_req: Request) { return {} }');
  }
  writeFileSync(file, code);
}
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.name.startsWith('.') || entry.name === 'node_modules' ? [] :
      entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
}
let changed = 0;
for (const file of files(root)) {
  if (!/\.(html|js)$/.test(file)) continue;
  const original = readFileSync(file, 'utf8');
  let code = original;
  code = code.replaceAll('@supabase/supabase-js@2/', '@supabase/supabase-js@2.117.0/');
  code = code.replaceAll('src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.0/dist/umd/supabase.js">',
    'src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.0/dist/umd/supabase.js" integrity="sha384-xPW3QHswsICVC2mW6BFNwMbhpLkbZ133fKOhxNx3QGGgAOJfL3O9t8r2aWn1aez6" crossorigin="anonymous">');
  if (/(?:completar-registro|restablecer-password)\.html$/.test(file)) {
    code = code.replaceAll('minlength="6"', 'minlength="12" maxlength="72"');
  }
  if (file.endsWith('.html') && /<head[\s>]/i.test(code) && !code.includes('src="/assets/js/kw-security.js')) {
    code = code.replace(/(<head[^>]*>)/i, '$1\n  <script src="/assets/js/kw-security.js?v=20260922"></script>\n  <meta name="referrer" content="strict-origin-when-cross-origin" />\n  <meta http-equiv="Content-Security-Policy" content="object-src \'none\'; base-uri \'self\'; form-action \'self\'; upgrade-insecure-requests" />');
  }
  code = code.replace(/createClient\(SUPABASE_URL, SUPABASE_KEY\)/g,
    'createClient(SUPABASE_URL, SUPABASE_KEY, { global: { fetch: window.kwSecureFetch } })');
  // textContent escapes text, but does not escape quotes in HTML attributes.
  code = code.replace(/return (div|d)\.innerHTML;/g,
    `return $1.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');`);
  if (code !== original) { writeFileSync(file, code); changed++; }
}
// Project cache rule: bump every reference to each modified shared asset.
for (const file of files(root).filter((p) => /\.(html|js|css)$/.test(p))) {
  const code = readFileSync(file, 'utf8');
  const next = code.replace(/((?:auth-guard|drawer|notif-bell|kw-ui|kw-revisiones|kw-compartir)\.js\?v=)[^"'\s<>]+/g, '$120260922');
  if (next !== code) writeFileSync(file, next);
}
console.log(`Security wiring: ${changed} frontend files updated.`);
