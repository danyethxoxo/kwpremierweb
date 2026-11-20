import {pathToFileURL} from 'node:url';

export async function probarConcurrencia(config,{fetchImpl=fetch,pausa=ms=>new Promise(r=>setTimeout(r,ms)),ahora=()=>performance.now()}={}) {
 const modo=config.modo||'conectividad';
 if(!['conectividad','inventario','sesion'].includes(modo))throw Error('Modo no permitido');
 const base=new URL(config.api);
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/')throw Error('Usa el origen HTTPS del proyecto');
 const niveles=config.niveles||[5,25,50,100,200];
 const repeticiones=config.repeticionesPorNivel??2;
 if(!Number.isInteger(repeticiones)||repeticiones<1||repeticiones>2)throw Error('Repeticiones permitidas: 1 o 2');
 if(!niveles.length||niveles.some(n=>!Number.isInteger(n)||n<1||n>200))throw Error('Concurrencia permitida: 1 a 200');
 const produccion=base.hostname==='iloetojomzqtadkithtv.supabase.co';
 if(produccion&&modo!=='conectividad'&&config.permitirProduccion!==true)throw Error('La prueba autenticada requiere staging o habilitacion explicita de produccion');
 const credenciales=config.sesiones||[];
 if(modo!=='conectividad') {
  if(credenciales.length<Math.max(...niveles))throw Error('Usa una sesion de prueba por participante');
  for(const session of credenciales) {
   let claims;try{claims=JSON.parse(Buffer.from(session.token.split('.')[1],'base64url').toString('utf8'));}catch{throw Error('Sesion de prueba no valida');}
   if(claims.iss!==base.origin+'/auth/v1')throw Error('La sesion no pertenece al proyecto de prueba');
  }
 }
 const resumen={modo,alcance:modo==='conectividad'?'Solo CORS y red; no mide consultas autenticadas ni inicios con contrasena':modo==='inventario'?'Consultas de inventario; no inicia sesiones con contrasena':'Valida y actualiza metadatos de sesiones de prueba; no inicia sesiones con contrasena',niveles:[],aprobado:true};
 for(const concurrencia of niveles) {
  const tiempos=[];const estados={};let siguiente=0;
  const total=concurrencia*repeticiones;
  const inicio=ahora();
  await Promise.all(Array.from({length:concurrencia},async()=>{
   while(siguiente<total) {
    const i=siguiente++;const salida=ahora();let status=0;
    try {
     const session=credenciales[i%Math.max(1,credenciales.length)];
     const headers={Origin:'https://kweb.com.mx','Content-Type':'application/json'};
     let body,method='OPTIONS',path='/functions/v1/mfa-correo';
     if(modo==='conectividad') {
      headers['Access-Control-Request-Method']='POST';headers['Access-Control-Request-Headers']='authorization,content-type';
     } else {
      method='POST';headers.Authorization='Bearer '+session.token;
      if(modo==='inventario') {
       path='/functions/v1/data-gateway/rpc/propiedades_inventario_pagina';
       const filtros=(config.filtros||[{estatus:'publicada',orden:'reciente'}]);
       body=JSON.stringify({p_filtros:filtros[i%filtros.length],p_pagina:1});
      } else body=JSON.stringify({accion:'estado',dispositivo_token:session.dispositivo||''});
     }
     const response=await fetchImpl(base.origin+path,{method,headers,body,signal:AbortSignal.timeout(config.timeoutMs||10000)});
     status=response.status;
     if(modo==='conectividad') {
      if(response.headers.get('access-control-allow-origin')!==headers.Origin)status=0;
      await response.arrayBuffer();
     } else {
      const data=await response.json();
      if(response.ok&&modo==='inventario'&&(!Array.isArray(data.data)||typeof data.total!=='number'))status=0;
      if(response.ok&&modo==='sesion'&&(data.verificado!==true||data.requiere_login))status=0;
     }
    }catch{if(status>=200&&status<300)status=0;}
    tiempos.push(ahora()-salida);estados[status]=(estados[status]||0)+1;
   }
  }));
  tiempos.sort((a,b)=>a-b);
  const errores=Object.entries(estados).reduce((n,[status,cantidad])=>n+(Number(status)>=200&&Number(status)<300?0:cantidad),0);
  const p95=Math.round(tiempos[Math.min(tiempos.length-1,Math.ceil(tiempos.length*.95)-1)]);
  const fila={concurrencia,solicitudes:total,errores,p95Ms:p95,maxMs:Math.round(tiempos.at(-1)),duracionMs:Math.round(ahora()-inicio),estados};
  resumen.niveles.push(fila);
  if(errores/total>.01||p95>(config.p95MaxMs||5000)){resumen.aprobado=false;resumen.detenidoEn=concurrencia;break;}
  await pausa(1500);
 }
 return resumen;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 try {
  let input='';for await(const chunk of process.stdin)input+=chunk;
  let config;try{config=JSON.parse(input);}catch{throw Error('Configuracion JSON no valida');}
  const resultado=await probarConcurrencia(config);
  process.stdout.write(JSON.stringify(resultado,null,2)+'\n');
  if(!resultado.aprobado)process.exitCode=1;
 }catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
