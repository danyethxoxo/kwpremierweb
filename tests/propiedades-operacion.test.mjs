import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import vm from 'node:vm';

test('operacion reconoce titulo, descripcion, sinonimos y ofertas conjuntas sin inventar datos', async () => {
 const db = new PGlite();
 try {
  const sql = readFileSync(new URL('../supabase/migrations/20261014155225_propiedades_operacion_por_texto.sql', import.meta.url),'utf8');
  await db.exec(sql.slice(0,sql.indexOf('revoke all')));
  const casos = [
   [null,'Venta de casa en Calimaya',null,['venta']],
   [null,'VENTA DE DEPARTAMENTO','Potencial de renta y rentabilidad',['venta']],
   [null,'Casa en RENTA','Precio de venta de muebles no incluido',['renta']],
   [null,'SE VENDEN DEPARTAMENTOS CALLE EJIDO',null,['venta']],
   [null,'Casa en preventa',null,['venta']],
   [null,'Propiedad 711','<p>CASA EN RENTA</p> Dentro de Condominio',['renta']],
   [null,'Casa bonita','Departamento en alquiler mensual',['renta']],
   [null,'Terreno','Se arrienda terreno industrial',['renta']],
   [null,'FOR SALE',null,['venta']],
   [null,'FOR RENT',null,['renta']],
   [null,'Venta / renta de nave',null,['venta','renta']],
   [null,'TORRE KREA','DEPARTAMENTO PARA VENTA O RENTA',['venta','renta']],
   [null,'Motto','Venta 3,600,000 y Renta amueblado 20,000',['venta','renta']],
   [null,'Casa','En venta. Ideal para generar ingresos por renta.',['venta']],
   ['renta','Propiedad','Incluye aviso del precio de venta',['renta']],
   ['venta','Casa','Potencial de renta',['venta']],
   [null,'Casa con rentabilidad','Cerca de restaurantes y ventanales',[]],
   [null,'Vente a vivir a Zibata','Casa equipada en residencial',[]],
   [null,null,null,[]]
  ];
  for(const [operacion,titulo,descripcion,esperado] of casos){
   const {rows} = await db.query('select public.propiedad_operaciones_filtro($1,$2,$3) operaciones',[operacion,titulo,descripcion]);
   assert.deepEqual(rows[0].operaciones,esperado,titulo || 'Sin texto');
  }
 } finally {await db.close();}
});

test('etiquetas distinguen operacion confirmada, conjunta y pendiente', () => {
 const html=readFileSync(new URL('../propiedades.html',import.meta.url),'utf8');
 const scope=vm.createContext({});
 vm.runInContext(html.slice(html.indexOf('  function etiquetaOperacion('),html.indexOf('  function fmtPrecio(')),scope);
 assert.equal(scope.etiquetaOperacion({operacion:'venta'}),'Venta');
 assert.equal(scope.etiquetaOperacion({operacion:'renta'}),'Renta');
 assert.equal(scope.etiquetaOperacion({operacion:'venta',operaciones_filtro:['venta','renta']}),'Venta y renta');
 assert.equal(scope.etiquetaOperacion({operacion:null,operaciones_filtro:[]}),'Por confirmar');
});
