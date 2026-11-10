import {secureServe,consumeLimit} from '../_shared/security.ts';
import {prepararTexto,validarCriterios,schema,instruccion} from './core.ts';
const key=Deno.env.get('GEMINI_API_KEY');
const model=Deno.env.get('GEMINI_SEARCH_MODEL')||'gemini-3.5-flash-lite';
const webhook=Deno.env.get('WEBHOOK_SECRET');
secureServe({name:'interpretar-busqueda',auth:req=>webhook&&req.headers.get('x-webhook-secret')===webhook?'service':'user',userLimit:5,ipLimit:30,maxBytes:8192},async(req,ctx)=>{
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=='object'||Array.isArray(body))return Response.json({error:'Describe la propiedad que buscas.'},{status:400});
 const comprobar=body.comprobar===true;
 if(comprobar&&(!webhook||req.headers.get('x-webhook-secret')!==webhook))return Response.json({error:'No autorizado'},{status:403});
 if(!key)return Response.json({error:'La búsqueda asistida aún no está configurada. Usa los filtros habituales.'},{status:422});
 let texto:string;
 try{texto=prepararTexto(comprobar?'Busco departamento en Narvarte, Ciudad de México, hasta 4.5 millones de pesos, 2 recámaras y 1 estacionamiento.':body.texto);}catch(error){return Response.json({error:(error as Error).message},{status:400});}
 if(ctx.userId)await consumeLimit('user:busqueda-ia-hora',ctx.userId,30,3600);
 try{
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
   method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},
   body:JSON.stringify({systemInstruction:{parts:[{text:instruccion}]},contents:[{role:'user',parts:[{text:texto}]}],
    generationConfig:{temperature:0,maxOutputTokens:1400,responseMimeType:'application/json',responseSchema:schema}}),
   signal:AbortSignal.timeout(20000)});
  if(response.status===429)return Response.json({error:'Se agotó la cuota disponible de IA. Puedes seguir usando los filtros normales.'},{status:429});
  if(!response.ok){if(comprobar){return Response.json({ok:false,modelo:model,estado:response.status});}console.error('Proveedor de búsqueda no disponible',response.status);return Response.json({error:'No se pudo interpretar la búsqueda. Usa los filtros normales o intenta más tarde.'},{status:422});}
  const data=await response.json();const text=(data.candidates?.[0]?.content?.parts||[]).map((p:{text?:string})=>p.text||'').join('');
  const parsed=JSON.parse(text);
  if(!/\b(venta|comprar|compra|renta|rentar|alquilar|arrendar|mensual)\b|al mes/i.test(texto))delete parsed.operacion;
  if(!/\b(pesos|mxn|usd|d[oó]lares)\b/i.test(texto))delete parsed.moneda;
  const criterios=validarCriterios(parsed);
  return Response.json({ok:true,criterios,...(comprobar?{modelo:model,configurada:true}:{})});
 }catch{
  return Response.json({error:'No se pudo interpretar la búsqueda. Conservamos tus filtros para que puedas continuar.'},{status:422});
 }
});
