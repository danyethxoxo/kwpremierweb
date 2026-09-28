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
    },
    validEmail: function (value) {
      return typeof value === 'string' && value.length <= 254 &&
        /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(value);
    },
    authErrorMessage: function (error, context) {
      var code = String(error && (error.code || error.name || '') || '').toLowerCase();
      var raw = String(error && (error.message || error.error_description || error.error || '') || '').trim();
      var normalized = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      var yaEspanol = /^(tu |se |no |el |la |las |los |escribe |codigo|contrase|correo|demasiados|limite|espera|configura|cuenta|este enlace|sesion|metodo|configuracion|origen|servicio)/.test(normalized);
      if (yaEspanol && raw) return raw;

      if (code === 'invalid_credentials' || /invalid login credentials|invalid credentials/.test(normalized)) {
        return 'El correo o la contraseña no son correctos.';
      }
      if (code === 'email_not_confirmed' || /email not confirmed|correo.*confirm/.test(normalized)) {
        return 'Confirma tu correo electrónico antes de iniciar sesión.';
      }
      if (code === 'user_banned' || /user is banned|usuario.*bloquead/.test(normalized)) {
        return 'Esta cuenta está temporalmente bloqueada. Contacta a administración.';
      }
      if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || /rate limit|too many requests|email rate limit|demasiados intentos/.test(normalized)) {
        return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
      }
      if (code === 'same_password' || /same password|different password|nueva contrasena.*diferente/.test(normalized)) {
        return 'La nueva contraseña debe ser diferente a la anterior.';
      }
      if (code === 'weak_password' || /password.*(weak|short|characters|breached)|contrasena.*(debil|corta)/.test(normalized)) {
        return 'La contraseña no cumple con los requisitos de seguridad.';
      }
      if (code === 'otp_expired' || code === 'access_denied' || /otp.*(expired|invalid)|token.*(expired|invalid)|link.*(expired|invalid)/.test(normalized)) {
        return 'El enlace ya venció o no es válido. Solicita uno nuevo.';
      }
      if (/redirect.*(not allowed|unauthorized)|not authorized.*redirect/.test(normalized)) {
        return 'No se pudo abrir el enlace de recuperación. Contacta a administración.';
      }
      if (code === 'session_not_found' || /auth session missing|session.*(missing|not found|expired)/.test(normalized)) {
        return 'La sesión ya venció. Solicita un nuevo enlace e inténtalo otra vez.';
      }
      if (/captcha|verification failed/.test(normalized)) {
        return 'No se pudo validar la solicitud. Inténtalo nuevamente.';
      }

      var fallback = {
        login: 'No se pudo iniciar sesión. Inténtalo de nuevo.',
        recovery: 'No se pudo enviar el enlace. Inténtalo de nuevo.',
        reset: 'No se pudo actualizar la contraseña. Inténtalo de nuevo.',
        invite: 'No se pudo completar el registro. Inténtalo de nuevo.',
        mfa: 'No se pudo completar la verificación. Inténtalo de nuevo.',
      };
      return fallback[context] || 'Ocurrió un error. Inténtalo de nuevo.';
    }
  });
})();
