// Solo lecturas reales. Sesiones sinteticas cifradas por stdin; no guarda credenciales.
import {generateKeyPairSync,privateDecrypt,constants,createDecipheriv} from 'node:crypto';
import {createInterface} from 'node:readline';
import {writeFileSync,existsSync,readFileSync} from 'node:fs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
console.log('PUBLICKEY '+JSON.stringify(publicKey.export({format:'jwk'})));
const entrada=process.argv[2];
if(entrada)writeFileSync(entrada+'.public.json',JSON.stringify(publicKey.export({format:'jwk'})));
async function* archivo(){for(let i=0;i<600;i++){if(existsSync(entrada)){yield readFileSync(entrada,'utf8');return;}await new Promise(r=>setTimeout(r,500));}throw Error('No se recibio la preparacion cifrada');}
const lines=entrada?archivo():createInterface({input:process.stdin,terminal:false});
function abrir(p){
 const key=privateDecrypt({key:privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(p.encryptedKey,'base64'));
 const bytes=Buffer.from(p.ciphertext,'base64'),d=createDecipheriv('aes-256-gcm',key,Buffer.from(p.iv,'base64'));
 d.setAuthTag(bytes.subarray(-16));const session=JSON.parse(Buffer.concat([d.update(bytes.subarray(0,-16)),d.final()]).toString('utf8'));key.fill(0);return session;
}
const filtros={estatus:'publicada',orden:'reciente',estado:['Ciudad de México'],tipo:['Departamento']};
const rutas=[
 {nombre:'propiedades-recientes',path:'/rpc/propiedades_inventario_pagina',body:{p_filtros:{estatus:'publicada',orden:'reciente'},p_pagina:1},valida:d=>Array.isArray(d.data)&&typeof d.total==='number'},
 {nombre:'propiedades-filtros',path:'/rpc/propiedades_inventario_pagina',body:{p_filtros:filtros,p_pagina:1},valida:d=>Array.isArray(d.data)&&typeof d.total==='number'},
 {nombre:'catalogo',path:'/rpc/propiedades_inventario_catalogo',body:{p_campo:'estado'},valida:d=>Array.isArray(d)},
 {nombre:'mapa',path:'/rpc/propiedades_inventario_mapa',body:{p_filtros:filtros},valida:d=>Array.isArray(d.puntos)&&typeof d.total==='number'},
 {nombre:'notificaciones',path:'/notificaciones?select=id,leido,created_at&order=created_at.desc&limit=20',valida:d=>Array.isArray(d)},
 {nombre:'perfiles-comprador',path:'/perfiles_comprador?select=id,nombre,activo&order=created_at.desc&limit=10',valida:d=>Array.isArray(d)},
 {nombre:'firmas',path:'/firmas_documentos?select=id,titulo,estado&order=created_at.desc&limit=10',valida:d=>Array.isArray(d)},
 {nombre:'dictamenes',path:'/dictamenes_con_asesor?select=id,folio,estado&order=created_at.desc&limit=20',valida:d=>Array.isArray(d)},
];
for await(const line of lines){
 let sesiones=[];const resultado={alcance:'Lecturas reales de ocho apartados desde una red y ocho identidades sinteticas. No mide 200 personas, escrituras ni contrasenas simultaneas.',niveles:[],aprobado:true};
 try{
  const input=JSON.parse(line);if(!Array.isArray(input.paquetes)||input.paquetes.length!==8)throw Error('Requiere ocho identidades');
  sesiones=input.paquetes.map(abrir);
  if(sesiones.some(s=>s.api!=='https://iloetojomzqtadkithtv.supabase.co'))throw Error('Proyecto inesperado');
  for(const [concurrencia,rondas] of [[25,1],[50,1],[200,10]]){
   for(let ronda=0;ronda<rondas;ronda++){
    const tiempos=[],estados={},porRuta={},regiones={},fallos={};const inicio=performance.now(),fecha=new Date().toISOString();
    await Promise.all(Array.from({length:concurrencia},async(_,i)=>{
     const session=sesiones[(Math.floor(i/8)+i+ronda)%8],ruta=rutas[i%8],start=performance.now();let status=0;
     try{
      const res=await fetch(session.api+'/functions/v1/data-gateway'+ruta.path,{method:ruta.body?'POST':'GET',headers:{Origin:'https://kweb.com.mx','x-region':'us-west-2',Authorization:'Bearer '+session.token,apikey:session.apikey,'Content-Type':'application/json'},body:ruta.body?JSON.stringify(ruta.body):undefined,signal:AbortSignal.timeout(12000)});
      status=res.status;const d=await res.json();if(res.ok&&!ruta.valida(d))status=0;
      const region=res.headers.get('x-sb-edge-region')||'no-indicada';regiones[region]=(regiones[region]||0)+1;
     }catch(error){const clase=error?.cause?.code||error?.name||'Error';fallos[clase]=(fallos[clase]||0)+1;if(status>=200&&status<300)status=0;}
     const ms=performance.now()-start;tiempos.push(ms);estados[status]=(estados[status]||0)+1;
     const r=porRuta[ruta.nombre]||={solicitudes:0,errores:0,maxMs:0};r.solicitudes++;if(status<200||status>=300)r.errores++;r.maxMs=Math.max(r.maxMs,Math.round(ms));
    }));
    tiempos.sort((a,b)=>a-b);const errores=Object.entries(estados).reduce((n,[s,c])=>n+(Number(s)>=200&&Number(s)<300?0:c),0);
    const fila={fecha,concurrencia,ronda:ronda+1,solicitudes:concurrencia,errores,p95Ms:Math.round(tiempos[Math.ceil(tiempos.length*.95)-1]),maxMs:Math.round(tiempos.at(-1)),duracionMs:Math.round(performance.now()-inicio),estados,regiones,porRuta,fallos};
    resultado.niveles.push(fila);console.log('NIVEL '+JSON.stringify(fila));
    if(errores/concurrencia>.01||fila.p95Ms>10000){resultado.aprobado=false;break;}
    await new Promise(r=>setTimeout(r,2000));
   }
   if(!resultado.aprobado)break;
  }
 }catch{resultado.aprobado=false;resultado.error='La prueba no pudo completarse';}
 finally{
  resultado.identidadesDePrueba=sesiones.length;
  const cierres=await Promise.allSettled(sesiones.map(async s=>{const r=await fetch(s.api+'/auth/v1/logout?scope=global',{method:'POST',headers:{apikey:s.apikey,Authorization:'Bearer '+s.token},signal:AbortSignal.timeout(10000)});await r.arrayBuffer();return r.ok;}));
  resultado.sesionesRevocadas=cierres.filter(r=>r.status==='fulfilled'&&r.value).length;
  writeFileSync(new URL('../docs/pruebas/carga-mixta-plataforma-20261120.json',import.meta.url),JSON.stringify(resultado,null,2)+'\n');
  console.log('FINAL '+JSON.stringify({aprobado:resultado.aprobado,rondas:resultado.niveles.length,solicitudes:resultado.niveles.reduce((s,x)=>s+x.solicitudes,0),sesionesRevocadas:resultado.sesionesRevocadas}));
  lines.close?.();process.exit(resultado.aprobado?0:1);
 }
}
