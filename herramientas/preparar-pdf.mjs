// Keep the audited, pinned browser bundle in sync with the lockfile.
import { readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const pkg = JSON.parse(readFileSync(new URL('../node_modules/jspdf/package.json', import.meta.url), 'utf8'));
if (pkg.version !== '4.2.1') throw new Error('Revisar la versión de jsPDF antes de actualizar el bundle público.');
const target = new URL('../assets/vendor/jspdf/', import.meta.url);
mkdirSync(target, { recursive: true });
for (const [source, name] of [['dist/jspdf.umd.min.js', 'jspdf-4.2.1.umd.min.js'], ['LICENSE', 'LICENSE']]) {
  const from = new URL('../node_modules/jspdf/' + source, import.meta.url);
  copyFileSync(from, new URL(name, target));
  console.log(name + ' sha256=' + createHash('sha256').update(readFileSync(from)).digest('hex'));
}
