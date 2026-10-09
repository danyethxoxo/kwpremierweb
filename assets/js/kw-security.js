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
    notificationUrl: function (value, tipo) {
      const seguro = window.kwSecurity.safeUrl(value, true);
      if (!seguro) return '';
      const url = new URL(seguro);
      if (tipo === 'resena') return location.origin + '/hub/resenas.html';
      if (url.pathname.startsWith('/kwpremierweb/')) url.pathname = url.pathname.slice('/kwpremierweb'.length);
      return url.href;
    },
    validPassword: function (value) {
      return typeof value === 'string' && value.length >= 12 &&
        new TextEncoder().encode(value).length <= 72 && !/[\x00-\x1f\x7f]/.test(value);
    },
    validEmail: function (value) {
      return typeof value === 'string' && value.length <= 254 &&
        /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(value);
    },
    setupOtpInput: function (input, options) {
      if (!input || !input.parentNode) return null;
      if (input._kwOtpInput) return input._kwOtpInput;
      options = options || {};
      var length = Number(options.length || input.maxLength || 6);
      if (!Number.isInteger(length) || length < 4 || length > 8) length = 6;

      var wrapper = document.createElement('div');
      wrapper.className = 'otp-inputs';
      wrapper.setAttribute('role', 'group');
      wrapper.setAttribute('aria-label', options.label || input.getAttribute('aria-label') || 'Código de verificación');
      var cells = [];
      for (var i = 0; i < length; i += 1) {
        var cell = document.createElement('input');
        cell.className = 'otp-cell';
        cell.type = 'text';
        cell.inputMode = 'numeric';
        cell.pattern = '[0-9]*';
        cell.autocomplete = i === 0 ? 'one-time-code' : 'off';
        cell.maxLength = 1;
        cell.setAttribute('aria-label', 'Dígito ' + (i + 1) + ' de ' + length);
        cell.setAttribute('enterkeyhint', 'done');
        wrapper.appendChild(cell);
        cells.push(cell);
      }

      input.type = 'hidden';
      input.value = '';
      input.required = false;
      input.removeAttribute('autocomplete');
      input.removeAttribute('placeholder');
      input.tabIndex = -1;
      input.setAttribute('aria-hidden', 'true');
      input.setAttribute('data-otp-value', 'true');
      input.parentNode.insertBefore(wrapper, input);

      function value() {
        return cells.map(function (cell) { return cell.value; }).join('');
      }

      function sync() {
        input.value = value();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      function complete() {
        var code = value();
        if (code.length === length && typeof options.onComplete === 'function') options.onComplete(code);
      }

      function setValue(raw, shouldFocus) {
        var digits = String(raw == null ? '' : raw).replace(/\D/g, '').slice(0, length);
        cells.forEach(function (cell, index) { cell.value = digits[index] || ''; });
        sync();
        if (shouldFocus) {
          var focusIndex = digits.length >= length ? length - 1 : digits.length;
          cells[focusIndex].focus();
          cells[focusIndex].select();
        }
        complete();
      }

      cells.forEach(function (cell, index) {
        cell.addEventListener('input', function () {
          var digits = cell.value.replace(/\D/g, '');
          if (digits.length > 1) {
            setValue(value().slice(0, index) + digits, true);
            return;
          }
          cell.value = digits;
          sync();
          if (digits && index < length - 1) cells[index + 1].focus();
          complete();
        });
        cell.addEventListener('paste', function (event) {
          var pasted = event.clipboardData ? event.clipboardData.getData('text') : '';
          var digits = pasted.replace(/\D/g, '');
          if (!digits) return;
          event.preventDefault();
          setValue(value().slice(0, index) + digits, true);
        });
        cell.addEventListener('keydown', function (event) {
          if (event.key === 'Backspace') {
            if (!cell.value && index > 0) {
              cells[index - 1].value = '';
              cells[index - 1].focus();
            } else {
              cell.value = '';
            }
            sync();
            event.preventDefault();
          } else if (event.key === 'Delete') {
            cell.value = '';
            sync();
            event.preventDefault();
          } else if (event.key === 'ArrowLeft' && index > 0) {
            cells[index - 1].focus();
            event.preventDefault();
          } else if (event.key === 'ArrowRight' && index < length - 1) {
            cells[index + 1].focus();
            event.preventDefault();
          } else if (event.key === 'Enter') {
            complete();
          }
        });
        cell.addEventListener('focus', function () { cell.select(); });
      });

      input._kwOtpInput = {
        focus: function () { cells[0].focus(); },
        clear: function () { setValue('', false); },
        setValue: function (raw) { setValue(raw, true); },
        value: value,
      };
      return input._kwOtpInput;
    },
    focusOtpInput: function (input) {
      if (input && input._kwOtpInput) input._kwOtpInput.focus();
      else if (input) input.focus();
    },
    clearOtpInput: function (input) {
      if (input && input._kwOtpInput) input._kwOtpInput.clear();
      else if (input) input.value = '';
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
