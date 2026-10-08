import { prepararCorreoUtf8 } from './email-utf8.ts'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'KW Premier <noreply@kwpremieroficial.com>'

export type AdjuntoCorreo = {
  filename: string
  content: string
  content_type?: string
}

export function escaparHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character] as string))
}

export function plantillaCorreo(params: {
  title: string
  intro: string
  content: string
  actionLabel?: string
  actionUrl?: string
  note?: string
  footer?: string
  code?: string
}): string {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#ffffff;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="padding:24px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;">
      <tr><td style="padding:0 0 18px;">${escaparHtml(params.intro)}</td></tr>
      <tr><td style="padding:2px 0 2px 14px;border-left:3px solid #cc0000;">
        <h1 style="margin:0 0 6px;font-size:18px;line-height:1.4;font-weight:700;color:#1a1a1a;">${escaparHtml(params.title)}</h1>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#555555;white-space:pre-line;overflow-wrap:anywhere;">${escaparHtml(params.content)}</p>
        ${params.code ? `<p style="margin:14px 0 0;font-size:30px;line-height:1.3;letter-spacing:5px;font-weight:700;color:#8a0000;">${escaparHtml(params.code)}</p>` : ''}
      </td></tr>
      ${params.actionUrl && params.actionLabel ? `<tr><td style="padding:24px 0 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#cc0000" style="background:#cc0000;border-radius:30px;text-align:center;">
          <a href="${escaparHtml(params.actionUrl)}" style="display:inline-block;padding:13px 24px;border:1px solid #cc0000;border-radius:30px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:700;color:#ffffff !important;text-decoration:none !important;"><span style="color:#ffffff;">${escaparHtml(params.actionLabel)}</span></a>
        </td></tr></table>
      </td></tr>` : '<tr><td style="height:24px;line-height:24px;">&nbsp;</td></tr>'}
      ${params.note ? `<tr><td style="padding:0 0 18px;font-size:13px;line-height:1.55;color:#666666;">${escaparHtml(params.note)}</td></tr>` : ''}
      ${params.footer ? `<tr><td style="font-size:12px;line-height:1.55;color:#999999;">${escaparHtml(params.footer)}</td></tr>` : ''}
    </table>
  </td></tr></table>
</body>
</html>`
}

export async function enviarCorreo(correo: {
  to: string
  subject: string
  html: string
  text: string
  attachments?: AdjuntoCorreo[]
}) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurada')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(prepararCorreoUtf8({
      from: EMAIL_FROM,
      to: [correo.to],
      subject: correo.subject,
      html: correo.html,
      text: correo.text,
      ...(correo.attachments?.length ? { attachments: correo.attachments } : {}),
    })),
  })
  if (!response.ok) {
    console.error('Resend rechazó el correo de KW Premier', response.status)
    throw new Error('No se pudo enviar el correo')
  }
  return await response.json().catch(() => null)
}
