// Public configuration only. Secrets belong in Supabase Edge secrets.
(function () {
  'use strict';
  var API_ORIGIN = 'https://iloetojomzqtadkithtv.supabase.co';
  var nativeFetch = window.fetch.bind(window);
  if (location.protocol === 'http:' &&
      ['kwpremieroficial.com', 'www.kwpremieroficial.com'].includes(location.hostname)) {
    location.replace('https://' + location.host + location.pathname + location.search + location.hash);
  }
  // Passed explicitly to Supabase, never patches the browser's global fetch.
  window.kwSecureFetch = function (input, init) {
    var raw = input instanceof Request ? input.url : String(input);
    var url = new URL(raw, location.href);
    if (url.origin === API_ORIGIN && url.pathname.startsWith('/rest/v1/')) {
      url.pathname = url.pathname.replace('/rest/v1/', '/functions/v1/data-gateway/');
      input = input instanceof Request ? new Request(url.href, input) : url.href;
    }
    return nativeFetch(input, init);
  };
  window.kwSecurity = Object.freeze({
    escapeHtml: function (value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    safeUrl: function (value, internalOnly) {
      try {
        var url = new URL(String(value || ''), location.origin);
        if (internalOnly) return url.origin === location.origin && /^https?:$/.test(url.protocol) ? url.href : '';
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
      } catch (e) { return ''; }
    },
    validPassword: function (value) {
      return typeof value === 'string' && value.length >= 12 &&
        new TextEncoder().encode(value).length <= 72 && !/[\x00-\x1f\x7f]/.test(value);
    }
  });
})();
