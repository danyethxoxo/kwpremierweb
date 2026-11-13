import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.kweb-dist');
// Solo contenido publico del frontend. Nunca copiar secretos, SQL o herramientas.
const folders = ['assets', 'hub', 'documentos', 'integraciones', 'kwpremierweb'];
fs.mkdirSync(output, { recursive: true });
for (const dir of folders) {
  if (fs.existsSync(path.join(root, dir))) fs.cpSync(path.join(root, dir), path.join(output, dir), { recursive: true });
}
for (const name of fs.readdirSync(root)) {
  if (/\.(html|ico|png|webmanifest)$/.test(name)) fs.copyFileSync(path.join(root, name), path.join(output, name));
}
fs.writeFileSync(path.join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
console.log('Frontend de KWEB preparado en .kweb-dist');
