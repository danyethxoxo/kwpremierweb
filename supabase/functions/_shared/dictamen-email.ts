import { escaparHtml } from './mailer.ts'
export function correoDictamen(asesor: string, direccion: string, estado: string) {
 const nombres: Record<string,string> = {autorizada:'Autorizado',condicionada:'Autorizado condicionado',devuelta:'Devuelto',borrador:'Sin dictaminar'}
 const estatus = nombres[estado] || 'Sin dictaminar'
 const color = estado === 'devuelta' ? '#c05600' : ['autorizada','condicionada'].includes(estado) ? '#15803d' : '#555555'
 const asunto = 'Dictamen de expediente: ' + estatus
 const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-size:14px;line-height:1.6">
 <tr><td><h1 style="font-size:18px;line-height:1.5;margin:0 0 16px">Dictamen de expediente: <span style="color:${color}">${escaparHtml(estatus)}</span></h1></td></tr>
 <tr><td style="padding:0 0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;line-height:1px;font-size:1px;border-top:2px solid ${color}">&nbsp;</td></tr></table></td></tr>
 <tr><td><p style="margin:0 0 16px">Hola: ${escaparHtml(asesor)}, adjuntamos el dictamen de expediente de tu listado con dirección:</p><p style="margin:0 0 24px;overflow-wrap:anywhere">${escaparHtml(direccion)}</p></td></tr>
 <tr><td style="padding:0 0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;line-height:1px;font-size:1px;border-top:1px solid #e5e7eb">&nbsp;</td></tr></table></td></tr>
 <tr><td style="padding:0 0 24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#cc0000" style="border-radius:30px"><a href="https://www.kwpremieroficial.com/hub/dictamenes.html" style="display:inline-block;padding:13px 24px;border:1px solid #cc0000;border-radius:30px;color:#ffffff !important;font-weight:700;text-decoration:none !important">Ver dictámenes</a></td></tr></table></td></tr>
 <tr><td style="padding:0 0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;line-height:1px;font-size:1px;border-top:1px solid #e5e7eb">&nbsp;</td></tr></table></td></tr>
 <tr><td><p style="margin:0 0 24px">Incluye un PDF solo con datos y otro con las correcciones correspondientes.</p></td></tr>
 <tr><td style="padding:0 0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;line-height:1px;font-size:1px;border-top:1px solid #e5e7eb">&nbsp;</td></tr></table></td></tr>
 <tr><td style="font-size:12px;color:#777777">Este es un correo automático, por favor no responder.</td></tr>
 </table></td></tr></table></body></html>`
 return {asunto,html}
}

