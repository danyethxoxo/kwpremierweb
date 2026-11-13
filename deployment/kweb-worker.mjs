// KWEB publica los mismos modulos sin duplicar la base de datos.
const PUBLIC_SITE = 'https://www.kwpremieroficial.com';
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' || url.hostname === 'www.kweb.com.mx') {
      url.protocol = 'https:'; url.hostname = 'kweb.com.mx';
      return Response.redirect(url.href, 308);
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      url.pathname = '/portal.html';
      return Response.redirect(url.href, 302);
    }
    if (['/market-center.html', '/staff.html', '/resena.html'].includes(url.pathname)) {
      return Response.redirect(PUBLIC_SITE + url.pathname + url.search + url.hash, 302);
    }
    const upstream = await env.ASSETS.fetch(request);
    const response = new Response(upstream.body, upstream);
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    response.headers.set('Content-Security-Policy', "object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests");
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    if ((response.headers.get('content-type') || '').includes('text/html')) response.headers.set('Cache-Control', 'no-store');
    return response;
  }
};
