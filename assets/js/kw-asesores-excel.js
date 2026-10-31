(function(){
 'use strict';
 var cargando;
 function biblioteca(){
  if(window.ExcelJS)return Promise.resolve(window.ExcelJS);
  if(!cargando)cargando=new Promise(function(resolve,reject){
   var script=document.createElement('script');script.src='/assets/vendor/exceljs/exceljs-4.4.0.min.js';script.integrity='sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz';
   var timer=setTimeout(function(){cargando=null;script.remove();reject(new Error('La carga de Excel tardó demasiado'));},15000);
   script.onload=function(){clearTimeout(timer);if(window.ExcelJS)resolve(window.ExcelJS);else{cargando=null;reject(new Error('Excel no disponible'));}};
   script.onerror=function(){clearTimeout(timer);cargando=null;script.remove();reject(new Error('No se pudo cargar Excel'));};document.head.appendChild(script);
  });
  return cargando;
 }
 async function crear(personas,opciones){
  opciones=opciones||{};var ExcelJS=await biblioteca(),fecha=opciones.fecha||new Date();
  var libro=new ExcelJS.Workbook();libro.creator='KW Premier';libro.created=fecha;libro.modified=fecha;
  var hoja=libro.addWorksheet('Directorio de asesores',{views:[{state:'frozen',ySplit:4,xSplit:1,activeCell:'B5',showGridLines:false}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:4'}});
  hoja.columns=[{width:34},{width:16},{width:14},{width:15},{width:20},{width:38},{width:20},{width:28},{width:28},{width:28},{width:28}];
  hoja.mergeCells('A1:K1');hoja.getCell('A1').value='KW PREMIER | Directorio de asesores';hoja.getRow(1).height=36;
  hoja.getCell('A1').font={name:'Calibri',size:20,bold:true,color:{argb:'FFFFFFFF'}};hoja.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17365D'}};hoja.getCell('A1').alignment={vertical:'middle',indent:1};
  hoja.mergeCells('A2:K2');hoja.getCell('A2').value=(opciones.grupo||'Todos')+'  |  '+personas.length+' registros  |  '+fecha.toLocaleString('es-MX',{timeZone:'America/Mexico_City'});hoja.getRow(2).height=27;
  hoja.getCell('A2').font={name:'Calibri',size:11,color:{argb:'FF45617D'}};hoja.getCell('A2').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F7'}};hoja.getCell('A2').alignment={vertical:'middle',indent:1};hoja.getRow(3).height=12;
  var titulos=['Nombre completo','Tipo','Estatus','KW ID','Teléfono','Correo electrónico','Fecha de ingreso','Puesto','Coach asignado','Célula','Asesor asignado'];
  var rows=personas.map(function(p){return[p.nombre||'',opciones.tipo?opciones.tipo(p):(/back/.test(p.grupo||'')?'Backoffice':p.grupo==='liderazgo'?'Liderazgo':'Asesor'),/baja/.test(p.grupo||'')?'Baja':'Activo',String(p.kwid||''),String(p.telefono||''),p.correo||'',String(p.fechaIngreso||''),p.puesto||'',p.coachAsignado||'',p.celula||'',p.asesorAsignado||''];});
  hoja.addTable({name:'DirectorioAsesores',ref:'A4',headerRow:true,style:{theme:'TableStyleMedium2',showRowStripes:true},columns:titulos.map(function(t){return{name:t,filterButton:true};}),rows:rows});
  hoja.getRow(4).height=29;hoja.getRow(4).eachCell(function(c){c.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245682'}};c.alignment={vertical:'middle',wrapText:true};});
  for(var i=5;i<=rows.length+4;i++){
   var row=hoja.getRow(i);row.height=32;
   row.eachCell({includeEmpty:true},function(c){c.font={name:'Calibri',size:11,color:{argb:'FF25364A'}};c.alignment={vertical:'middle',wrapText:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:i%2?'FFFFFFFF':'FFF1F5FA'}};c.border={bottom:{style:'hair',color:{argb:'FFDCE5EF'}}};});
   [4,5,7].forEach(function(n){row.getCell(n).numFmt='@';});
   var tipo=row.getCell(2);tipo.font={name:'Calibri',size:11,bold:true,color:{argb:tipo.value==='Liderazgo'?'FFCE011F':tipo.value==='Backoffice'?'FF7541AD':'FF1A65B0'}};
  }
  hoja.headerFooter.oddFooter='&LKW Premier&RPágina &P de &N';
  return libro;
 }
 async function descargar(personas,opciones){
  var libro=await crear(personas,opciones),buffer=await libro.xlsx.writeBuffer();
  var url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  var a=document.createElement('a');a.href=url;a.download='asesores-kw-premier-'+new Date().toISOString().slice(0,10)+'.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);
 }
 window.kwAsesoresExcel=Object.freeze({crear:crear,descargar:descargar});
})();
