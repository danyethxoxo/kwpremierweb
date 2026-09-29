const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'KW Premier <noreply@kwpremieroficial.com>'
const LOGO_URL = 'https://www.kwpremieroficial.com/assets/img/logo-kw-premier.png'

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
  actionLabel: string
  actionUrl: string
  note: string
  footer?: string
}): string {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f4f4;color:#1f1f1f;font-family:Arial,Helvetica,sans-serif;">
  <div style="padding:28px 14px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e4;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:25px 34px 18px;border-bottom:4px solid #df0000;">
          <img src="${LOGO_URL}" alt="KW Premier" width="172" style="display:block;width:172px;height:auto;border:0;">
        </td>
      </tr>
      <tr>
        <td style="padding:34px 34px 30px;">
          <h1 style="margin:0 0 18px;font-size:26px;line-height:1.2;color:#202020;">${escaparHtml(params.title)}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escaparHtml(params.intro)}</p>
          <p style="margin:0 0 25px;font-size:15px;line-height:1.6;">${escaparHtml(params.content)}</p>
          <p style="margin:0 0 28px;">
            <a href="${escaparHtml(params.actionUrl)}" style="display:inline-block;padding:14px 24px;background:#df0000;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:700;">${escaparHtml(params.actionLabel)}</a>
          </p>
          <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#666666;">${escaparHtml(params.note)}</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#777777;">${escaparHtml(params.footer || 'Te llega porque tienes una cuenta en el portal de KW Premier.')}</p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`
}

export async function enviarCorreo(correo: { to: string; subject: string; html: string; text: string }) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurada')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [correo.to],
      subject: correo.subject,
      html: correo.html,
      text: correo.text,
    }),
  })
  if (!response.ok) {
    console.error('Resend rechazó el correo de KW Premier', response.status)
    throw new Error('No se pudo enviar el correo')
  }
  return await response.json().catch(() => null)
}
