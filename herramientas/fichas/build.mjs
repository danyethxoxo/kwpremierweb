import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({ absWorkingDir: fileURLToPath(new URL('../../', import.meta.url)), entryPoints: ['herramientas/fichas/vector.mjs'], outfile: 'assets/vendor/fichas/vector.js', bundle: true, format: 'iife', globalName: 'kwFichaVector', minify: true, legalComments: 'eof', target: ['es2020'] });
