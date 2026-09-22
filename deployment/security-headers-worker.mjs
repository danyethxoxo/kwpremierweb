// Optional Cloudflare Worker ROUTE on the existing domain (not a new origin).
// Deploy only after the domain is behind Cloudflare with Full (strict) TLS.
// GitHub Pages ignores _headers files, so headers must be set at the proxy.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:') {
      url.protocol = 'https:';
      return Response.redirect(url.href, 308);
    }
    const upstream = await fetch(request);
    const response = new Response(upstream.body, upstream);
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    response.headers.set('Content-Security-Policy', "object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests");
    // CORS on static pages is unnecessary. API CORS is set by the Edge wrapper.
    response.headers.delete('Access-Control-Allow-Origin');
    return response;
  }
};
