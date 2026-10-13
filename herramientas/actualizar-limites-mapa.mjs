// Fuente: INEGI, Marco Geoestadistico. Conservar sus metadatos y documentar
// la simplificacion cartografica realizada por KW Premier.
import fs from 'node:fs';
import path from 'node:path';
const destino=new URL('../assets/data/limites-mx/',import.meta.url);
fs.mkdirSync(destino,{recursive:true});
function distancia(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=dx||dy?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy))):0;return (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;}
function anillo(p,tolerancia){
 const marcados=new Uint8Array(p.length);marcados[0]=marcados[p.length-1]=1;const pila=[[0,p.length-1]];
 while(pila.length){const [a,b]=pila.pop();let max=tolerancia*tolerancia,indice=0;for(let i=a+1;i<b;i++){const d=distancia(p[i],p[a],p[b]);if(d>max){max=d;indice=i;}}if(indice){marcados[indice]=1;pila.push([a,indice],[indice,b]);}}
 let r=p.filter((_,i)=>marcados[i]);if(r.length<4)r=p;
 return r.map(c=>c.slice(0,2).map(n=>Math.round(n*100000)/100000));
}
function transformar(datos,tolerancia){
 return {...datos,transformacion_kw:'Simplificacion Douglas-Peucker para visualizacion, no para deslindes. Tolerancia '+tolerancia+' grados; coordenadas redondeadas a cinco decimales.',features:datos.features.map(f=>({...f,geometry:{type:f.geometry.type,coordinates:f.geometry.type==='MultiPolygon'?f.geometry.coordinates.map(p=>p.map(r=>anillo(r,tolerancia))):f.geometry.coordinates.map(r=>anillo(r,tolerancia))}}))};
}
async function obtener(ruta){for(let i=0;i<3;i++){try{const r=await fetch('https://gaia.inegi.org.mx/wscatgeo/v2/'+ruta,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(r.status);return await r.json();}catch(e){if(i===2)throw e;}}}
const estados=transformar(await obtener('geo/mgee/'),.001);
fs.writeFileSync(new URL('estados.geojson',destino),JSON.stringify(estados));
const indice={fuente:'INEGI. Marco Geoestadistico, diciembre de 2025',fecha_descarga:new Date().toISOString(),estados:estados.features.map(f=>({id:f.properties.cvegeo,nombre:f.properties.nomgeo})),municipios:[]};
const pendientes=indice.estados.slice();
await Promise.all(Array.from({length:3},async()=>{while(pendientes.length){const estado=pendientes.shift(),archivo=new URL(estado.id+'.geojson',destino);let datos;
 if(fs.existsSync(archivo))datos=JSON.parse(fs.readFileSync(archivo,'utf8'));else{datos=transformar(await obtener('geo/mgem/'+estado.id),.0003);fs.writeFileSync(archivo,JSON.stringify(datos));}
 indice.municipios.push(...datos.features.map(f=>({id:f.properties.cvegeo,estado:estado.id,nombre:f.properties.nomgeo})));
 console.log(estado.id,estado.nombre,datos.features.length,fs.statSync(archivo).size);
}}));
indice.municipios.sort((a,b)=>a.id.localeCompare(b.id));
fs.writeFileSync(new URL('indice.json',destino),JSON.stringify(indice));
console.log('Listo:',indice.estados.length,'estados,',indice.municipios.length,'municipios.');
