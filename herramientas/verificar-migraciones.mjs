// Revisa la nomenclatura y la deriva conocida de las dos carpetas de SQL.
// No conecta a Supabase y no ejecuta ninguna migracion.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sqlDir = resolve(ROOT, 'supabase/sql');
const hostedDir = resolve(ROOT, 'supabase/migrations');
const baselinePath = resolve(sqlDir, 'migration-baseline.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`[FALTA] ${message}`);
}

function names(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

const manual = names(sqlDir);
const hosted = names(hostedDir);
const prefixGroups = new Map();

for (const name of manual) {
  const match = /^(\d{3})_[a-z0-9_]+\.sql$/i.exec(name);
  if (!match) fail(`supabase/sql/${name} no tiene prefijo numerico de tres digitos`);
  else prefixGroups.set(match[1], [...(prefixGroups.get(match[1]) || []), name]);
}

const currentDuplicates = Object.fromEntries(
  [...prefixGroups.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([prefix, files]) => [prefix, files.sort()])
);
const knownDuplicates = Object.fromEntries(
  Object.entries(baseline.legacy_duplicate_prefixes || {})
    .map(([prefix, files]) => [prefix, [...files].sort()])
);

for (const [prefix, files] of Object.entries(currentDuplicates)) {
  if (JSON.stringify(files) !== JSON.stringify(knownDuplicates[prefix])) {
    fail(`el prefijo ${prefix} tiene una combinacion nueva de archivos: ${files.join(', ')}`);
  } else {
    console.log(`[AVISO] prefijo historico duplicado ${prefix}: ejecutar en orden alfabetico`);
  }
}
for (const prefix of Object.keys(knownDuplicates)) {
  if (!currentDuplicates[prefix]) fail(`desaparecio el grupo historico registrado ${prefix}; actualiza el baseline con revision`);
}

if (!hosted.length) fail('supabase/migrations esta vacia');
const timestampNames = hosted.map((name) => /^([0-9]{14})_[a-z0-9_]+\.sql$/i.exec(name));
timestampNames.forEach((match, index) => {
  if (!match) fail(`supabase/migrations/${hosted[index]} no tiene nombre timestamp valido`);
});
const timestamps = timestampNames.filter(Boolean).map((match) => match[1]);
if (new Set(timestamps).size !== timestamps.length) fail('supabase/migrations tiene timestamps repetidos');
if (timestamps.some((value, index) => index && value < timestamps[index - 1])) {
  fail('supabase/migrations no esta en orden cronologico');
}

console.log(`Revisados: ${manual.length} SQL manuales y ${hosted.length} migraciones timestamp.`);
if (failures.length) {
  console.error(`Resultado: ${failures.length} problemas de migracion.`);
  process.exitCode = 1;
} else {
  console.log('Resultado: nomenclatura y baseline consistentes.');
}
