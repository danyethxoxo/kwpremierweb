import sharp from 'sharp';
import { pathToFileURL } from 'node:url';

export async function crearMiniatura(bytes) {
  return sharp(bytes,{limitInputPixels:40000000,animated:false})
    .rotate().resize(800,600,{fit:'cover',withoutEnlargement:true})
    .webp({quality:78,effort:4}).toBuffer();
}

async function main() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const secret = process.env.KW_SYNC_SECRET;
  if (!base || !key || !secret) throw new Error('Falta la configuración de miniaturas');
  async function llamar(body) {
    const response = await fetch(base+'/functions/v1/miniaturas-propiedades',{
      method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'x-sync-secret':secret,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(90000)
    });
    if (!response.ok) throw new Error('Servicio de miniaturas: HTTP '+response.status);
    return response.json();
  }
  let total=0;
  for(let batch=0;batch<250;batch++) {
    const {items}=await llamar({accion:'pendientes'});
    if(!items?.length) { console.log('Miniaturas actualizadas:',total); return; }
    const resultados=[];let next=0;
    async function worker() {
      while(next<items.length) {
        const item=items[next++];let ok=false;
        try {
          const source=new URL(item.imagen_origen);
          const origenPermitido =
            (source.hostname==='storage.googleapis.com' && source.pathname.startsWith('/attachment-listing-prod-5af4/')) ||
            (source.hostname==='repstaticneu.azureedge.net' && source.pathname.startsWith('/images/'));
          if(source.protocol!=='https:' || !origenPermitido) throw new Error('Origen no permitido');
          const response=await fetch(source,{redirect:'error',signal:AbortSignal.timeout(45000)});
          if(!response.ok || Number(response.headers.get('content-length'))>25000000) throw new Error('Imagen no disponible');
          const data=Buffer.from(await response.arrayBuffer());
          if(data.length>25000000) throw new Error('Imagen demasiado grande');
          const imagen=await crearMiniatura(data);
          if(imagen.length>250000) throw new Error('Miniatura demasiado grande');
          const upload=new URL(item.upload_url);
          if(upload.origin!==new URL(base).origin || !upload.pathname.startsWith('/storage/v1/object/upload/sign/propiedades-miniaturas/')) throw new Error('Carga no permitida');
          const uploaded=await fetch(upload,{method:'PUT',headers:{'Content-Type':'image/webp','x-upsert':'true'},body:imagen,signal:AbortSignal.timeout(45000)});
          if(!uploaded.ok) throw new Error('No se pudo cargar la miniatura');
          ok=true;
        } catch { console.warn('Miniatura pendiente:',item.id); }
        resultados.push({id:item.id,imagen_origen:item.imagen_origen,ok});
      }
    }
    await Promise.all([worker(),worker(),worker(),worker()]);
    const {guardadas}=await llamar({accion:'confirmar',items:resultados});total+=guardadas;
    console.log('Miniaturas generadas:',total);
  }
  throw new Error('Se alcanzó el límite de lotes; continuar en la siguiente ejecución');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
