import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ExcelJS=require('../assets/vendor/exceljs/exceljs-4.4.0.min.js');
test('Excel real conserva texto, filtros, encabezado azul, filas y encabezados congelados',async()=>{
 const scope=vm.createContext({window:{ExcelJS},Date});vm.runInContext(fs.readFileSync(new URL('../assets/js/kw-asesores-excel.js',import.meta.url),'utf8'),scope);
 const data=[{nombre:'Adriana García Rodríguez',correo:'ana@example.com',kwid:'001234',telefono:'0555123456',grupo:'asesor_activo',fechaIngreso:'11/01/2018'},{nombre:'=1+1',correo:'lider@example.com',grupo:'liderazgo'}];
 const book=await scope.window.kwAsesoresExcel.crear(data,{grupo:'Todos',fecha:new Date('2026-10-30T18:00:00Z')});const bytes=await book.xlsx.writeBuffer();assert.equal(Buffer.from(bytes).subarray(0,2).toString(),'PK');
 const reread=new ExcelJS.Workbook();await reread.xlsx.load(bytes);const sheet=reread.getWorksheet('Directorio de asesores');assert.equal(sheet.getCell('A5').value,data[0].nombre);assert.equal(sheet.getCell('D5').value,'001234');assert.equal(sheet.getCell('E5').value,'0555123456');assert.equal(sheet.getCell('A6').value,'=1+1');assert.equal(sheet.views[0].ySplit,4);assert.equal(sheet.getCell('A1').fill.fgColor.argb,'FF17365D');assert.equal(sheet.getTable('DirectorioAsesores').table.autoFilterRef,'A4:K6');assert.equal(sheet.getTable('DirectorioAsesores').table.columns.every(c=>c.filterButton),true);
 fs.mkdirSync('outputs/asesores',{recursive:true});fs.writeFileSync('outputs/asesores/ejemplo-directorio.xlsx',Buffer.from(bytes));
});
