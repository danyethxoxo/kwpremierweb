// Política de navegación. La autorización de datos se comprueba en el servidor.
(function () {
  'use strict';
  var DAY_MS = 24 * 60 * 60 * 1000;
  var DEVICE_KEY = 'kw_device_token_v1';
  var volatileDeviceToken = '';
  var MFA_URL = 'https://iloetojomzqtadkithtv.supabase.co/functions/v1/mfa-correo';

  function deviceToken() {
    try {
      var stored = localStorage.getItem(DEVICE_KEY);
      if (/^[A-Za-z0-9_-]{43}$/.test(stored || '')) return stored;
    } catch (error) {}
    if (!volatileDeviceToken) {
      var bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      volatileDeviceToken = btoa(Array.from(bytes, function (byte) { return String.fromCharCode(byte); }).join(''))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      try { localStorage.setItem(DEVICE_KEY, volatileDeviceToken); } catch (error) {}
    }
    return volatileDeviceToken;
  }

  function loginExpired(session, now) {
    try {
      var part = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
      var methods = Array.isArray(claims.amr) ? claims.amr : [];
      var timestamps = methods.filter(function (entry) { return entry.method !== 'token_refresh'; })
        .map(function (entry) { return Number(entry.timestamp); }).filter(function (value) { return Number.isFinite(value) && value > 0; });
      // Los tokens antiguos sin AMR usan la fecha original del usuario.
      var started = timestamps.length ? Math.max.apply(Math, timestamps) * 1000
        : Date.parse(session.user && session.user.last_sign_in_at);
      return !Number.isFinite(started) || (now == null ? Date.now() : now) - started >= DAY_MS;
    } catch (error) { return true; }
  }

  async function mfaState(client) {
    var refreshed = false;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var result = await client.auth.getSession();
        if (result.error) throw result.error;
        if (!result.data || !result.data.session) return { sin_sesion: true };
        if (loginExpired(result.data.session)) return { requiere_login: true };
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 12000);
        var response;
        try {
          response = await fetch(MFA_URL, {
            method: 'POST', cache: 'no-store', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + result.data.session.access_token },
            body: JSON.stringify({ accion: 'estado', dispositivo_token: deviceToken() })
          });
        } finally { clearTimeout(timer); }
        if (response.status === 401 && !refreshed) {
          refreshed = true;
          var refresh = await client.auth.refreshSession();
          if (refresh.error) {
            if (refresh.error.status === 400 || refresh.error.status === 401 || refresh.error.status === 403) return { sin_sesion: true };
            throw refresh.error;
          }
          continue;
        }
        var payload = await response.json().catch(function () { return {}; });
        if (!response.ok) {
          var error = new Error(payload.error || 'No se pudo comprobar la sesión.');
          error.status = response.status;
          throw error;
        }
        return payload;
      } catch (error) {
        if (error.status === 401 || error.code === 'refresh_token_not_found' || error.code === 'refresh_token_already_used') return { sin_sesion: true };
        var transient = !error.status || error.status >= 500;
        if (!transient || attempt === 2) throw error;
        await new Promise(function (resolve) { setTimeout(resolve, 400 * (attempt + 1)); });
      }
    }
    throw new Error('No se pudo comprobar la sesión.');
  }

  window.kwSession = Object.freeze({ deviceToken: deviceToken, loginExpired: loginExpired, mfaState: mfaState });
})();
