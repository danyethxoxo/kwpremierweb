export const FUENTES={
 lore:{id:'15LwnQ-y0cOfjXBg1hEU9qo6qQSLy6dNgCIaGHxruWPw',tab:'KW Premier',gid:926790466,rango:"'KW Premier'!A1:BE70"},
 comparativa:{id:'1s2JtYUj0mAySAEDONXJSTjPS9EDvwbQsXela-pt00qY',tabs:['KW Premier','KW City','KW Pedregal','KW Enlace','KW Mas','KW Pani-Barragán']}
};
type Grid=unknown[][];
export function numero(v:unknown):number|null{
 if(typeof v==='number')return Number.isFinite(v)?v:null;
 const s=String(v??'').trim();if(!s||s.startsWith('#')||/%/.test(s))return null;
 if(!/^[-+$\s\d,.()]+$/.test(s))return null;
 const n=Number(s.replace(/[$,\s()]/g,''));return Number.isFinite(n)?(s.includes('(')?-Math.abs(n):n):null;
}
const normal=(s:unknown)=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const at=(g:Grid,r:number,c:number)=>numero(g[r-1]?.[c-1]);
const suma=(ns:(number|null)[])=>ns.some(n=>n===null)?null:ns.reduce<number>((a,n)=>a+(n||0),0);
export function leerCentro(g:Grid,nombre:string){
 const premier=normal(g[4]?.[5]).includes('citas de reclutamiento')&&normal(g[4]?.[16]).includes('crecimiento neto');
 const otro=normal(g[7]?.[6]).includes('citas de reclutamiento')&&normal(g[7]?.[9])==='gross';
 if(!premier&&!otro)throw Error('La estructura de '+nombre+' cambió.');
 return {nombre,asociados:premier?at(g,22,10):at(g,8,24),
  citas:premier?suma([at(g,7,6),at(g,7,9),at(g,7,12)]):suma([at(g,12,7),at(g,12,8)]),
  altas:premier?at(g,22,15):at(g,10,10),netos:premier?at(g,7,17):at(g,10,15),
  bajas:premier?at(g,20,15):at(g,25,10),
  company:premier?at(g,7,19):at(g,11,18),gastos:premier?at(g,7,20):at(g,11,19),
  utilidad:premier?at(g,20,20):at(g,13,18),gci:premier?at(g,19,20):at(g,24,19)};
}
export function leerLore(g:Grid){
 if(!normal(g[29]?.[3]).includes('unidades cerradas')||!normal(g[32]?.[3]).includes('exclusivas')||!normal(g[35]?.[3]).includes('opciones'))throw Error('La estructura del LORE cambió.');
 const serie=(r:number)=>({venta:at(g,r,9),renta:at(g,r,12)});
 const indicadores=[
  {id:'lados',label:'Lados cerrados',...serie(30),volumen:serie(31)},
  {id:'exclusivas',label:'Exclusivas',...serie(33),volumen:serie(34)},
  {id:'opciones',label:'Opciones',...serie(36),volumen:serie(37)},
  {id:'listadosCerrados',label:'Listados cerrados',...serie(39),volumen:serie(40)},
  {id:'acuerdos',label:'Acuerdos firmados',...serie(42),volumen:serie(43)}
 ];
 const centro=leerCentro(g,'KW Premier');
 const diarios=Array.from({length:31},(_,i)=>({dia:i+1,asistencia:at(g,10,27+i),conexiones:at(g,12,27+i),citas:at(g,14,27+i)}));
 return {centro,indicadores,diarios,inventario:{exclusivas:{venta:at(g,42,22),renta:at(g,42,21)},opciones:{venta:at(g,41,22),renta:at(g,41,21)}},metas:{lados:at(g,24,25),asociados:at(g,15,17),citas:suma([at(g,15,6),at(g,15,9),at(g,15,12)])}};
}
