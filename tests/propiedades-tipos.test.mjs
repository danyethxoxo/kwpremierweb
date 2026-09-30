import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('el título complementa el tipo original y reconoce el inmueble principal', async () => {
  const db = new PGlite();
  try {
    const sql = readFileSync(new URL('../supabase/migrations/20260930192744_tipos_propiedades_por_titulo.sql', import.meta.url), 'utf8');
    await db.exec(sql.slice(0, sql.indexOf('revoke all')));
    const casos = [
      ['Duplex', 'Venta de casa en Azcapotzalco', ['Duplex', 'Casa']],
      ['Duplex', 'Casa dúplex en venta', ['Duplex', 'Casa']],
      ['Terreno', 'Terreno para construir casa', ['Terreno']],
      ['Casa', 'Casa con oficina y bodega', ['Casa']],
      ['Condominio', 'DEPTO. EN VENTA', ['Condominio', 'Departamento']],
      ['Condominio', 'Venta de departamento', ['Condominio', 'Departamento']],
      ['Propiedad', 'Local comercial en renta', ['Propiedad', 'Local comercial']],
      ['Propiedad', 'Locales en venta', ['Propiedad', 'Local comercial']],
      ['Propiedad', 'Bodega con oficinas', ['Propiedad', 'Bodega']],
      ['Propiedad', 'Oficina con bodega', ['Propiedad', 'Oficina']],
      ['Propiedad', 'Lote en venta', ['Propiedad', 'Terreno']],
      ['Propiedad', 'Nave industrial en renta', ['Propiedad', 'Nave industrial']],
      ['Duplex', 'Excelente oportunidad en Polanco', ['Duplex']],
      ['Terreno', 'Busco casa en esta zona', ['Terreno']],
      [null, null, []],
      ['Casa', 'Casablanca, excelente oportunidad', ['Casa']]
    ];
    for (const [tipo, titulo, esperado] of casos) {
      const result = await db.query('select public.propiedad_tipos_filtro($1,$2) as tipos', [tipo, titulo]);
      assert.deepEqual(result.rows[0].tipos, esperado, titulo || 'Sin título');
    }
  } finally { await db.close(); }
});
