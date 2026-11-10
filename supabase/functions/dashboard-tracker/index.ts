import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.117.0';
import {secureServe} from '../_shared/security.ts';
import {FUENTES,leerCentro,leerLore} from './core.ts';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const webhook=Deno.env.get('WEBHOOK_SECRET');
let cache:{fecha:number;data:unknown}|null=null,pending:Promise<unknown>|null=null;
class FuenteError extends Error{constructor(public codigo:number,public fuente:string){super('No pudimos leer '+fuente+'.');}}
async function token(){
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:Deno.env.get('GOOGLE_CLIENT_ID')||'',client_secret:Deno.env.get('GOOGLE_CLIENT_SECRET')||'',refresh_token:Deno.env.get('GOOGLE_REFRESH_TOKEN')||'',grant_type:'refresh_token'}),signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw new FuenteError(r.status,'la conexión de Google');
 return (await r.json()).access_token as string;
}
async function leer(id:string,rangos:string[],access:string){
 const u=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+id+'/values:batchGet');
 rangos.forEach(r=>u.searchParams.append('ranges',r));u.searchParams.set('valueRenderOption','FORMATTED_VALUE');
 const r=await fetch(u,{headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new FuenteError(r.status,id===FUENTES.lore.id?'el Tracker/LORE':'la comparativa');
 const d=await r.json();return d.valueRanges as {values?:unknown[][]}[];
}
async function cargar(){
 const access=await token();
 const [principal,comparativa,metadata]=await Promise.all([
  leer(FUENTES.lore.id,[FUENTES.lore.rango],access),
  leer(FUENTES.comparativa.id,FUENTES.comparativa.tabs.map(t=>"'"+t+"'!A1:Z65"),access),
  Promise.all([FUENTES.lore.id,FUENTES.comparativa.id].map(async id=>{const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+id+'?fields=properties(title)',{headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(12000)});if(!r.ok)throw new FuenteError(r.status,'el título del archivo');return (await r.json()).properties.title as string;}))
 ]);
 const lore=leerLore(principal[0]?.values||[]),centros=FUENTES.comparativa.tabs.map((t,i)=>leerCentro(comparativa[i]?.values||[],t));
 return {ok:true,actualizado:new Date().toISOString(),intervalo:60,periodo:metadata[0],periodoComparativa:metadata[1],
 lore,centros,fuentes:{lore:{id:FUENTES.lore.id,gid:FUENTES.lore.gid},comparativa:{id:FUENTES.comparativa.id,gid:1816547468}},
 advertencias:/enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|20\d{2}/i.test(metadata[1])?[]:['El archivo comparativo no indica periodo. Verifica que corresponda al mismo corte.']};
}
secureServe({name:'dashboard-tracker',auth:req=>webhook&&req.headers.get('x-webhook-secret')===webhook?'service':'user',userLimit:12,ipLimit:90,maxBytes:2048},async(req,ctx)=>{
 const interno=Boolean(webhook&&req.headers.get('x-webhook-secret')===webhook);
 if(!interno){
  const {data,error}=await admin.from('profiles').select('role').eq('id',ctx.userId).maybeSingle();
  if(error)return Response.json({error:'No pudimos comprobar tus permisos.'},{status:503});
  if(!data||!['master','admin','staff'].includes(data.role))return Response.json({error:'Dashboard disponible para liderazgo.'},{status:403});
 }
 try{
  if(cache&&Date.now()-cache.fecha<30000)return Response.json(cache.data);
  if(!pending)pending=cargar().then(data=>{cache={fecha:Date.now(),data};return data;}).finally(()=>{pending=null;});
  return Response.json(await pending);
 }catch(e){
  if(e instanceof FuenteError){
   const acceso=e.codigo===403||e.codigo===404;
   return Response.json({error:acceso?'Falta acceso de lectura de dani.guerrero@kwmexico.mx a '+e.fuente+'.':'No pudimos actualizar Google Sheets. Intenta de nuevo.',...(interno?{codigo:e.codigo,fuente:e.fuente}:{})},{status:acceso?422:502});
  }
  return Response.json({error:'No pudimos leer los indicadores. Revisa la estructura de los archivos.'},{status:422});
 }
});
