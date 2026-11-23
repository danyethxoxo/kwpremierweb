(function () {
 'use strict';
 const $ = id => document.getElementById(id);
 const API = 'https://iloetojomzqtadkithtv.supabase.co/functions/v1/prospectos-gmail';
 const callback = new URLSearchParams(location.hash.slice(1));
 if (['gmail_code','gmail_state','gmail_error'].some(k => callback.has(k))) history.replaceState(null, '', location.pathname + location.search);
 let sb, user, rows = [], editing = null, gmail = null, started = false, revision = 0, controller, timer;
 const views = ['vista-lista','vista-formulario','vista-gmail','vista-reglas'];
 function error(id, message) { $(id).textContent = message || ''; $(id).hidden = !message; }
 function view(id) {
  views.forEach(v => { $(v).hidden = v !== id; });
  if (id !== 'vista-gmail') $('g-client-secret').value = '';
  error('prospectos-error', '');
  document.body.classList.toggle('prospectos-editando', id !== 'vista-lista');
  if (id === 'vista-gmail') { $('g-client-id').value = gmail?.client_id || ''; $('g-client-secret').value = ''; $('g-redirect').value = gmail?.redirect_uri || API; }
 }
 function node(tag, text, className) { const el = document.createElement(tag); el.textContent = text || ''; if (className) el.className = className; return el; }
 async function api(accion, data = {}) {
  const s = await sb.auth.getSession();
  if (s.error || !s.data.session?.access_token) throw Error('La sesión venció. Vuelve a ingresar.');
  const r = await fetch(API, { method: 'POST', headers: { Authorization: 'Bearer ' + s.data.session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ accion, ...data }), signal: AbortSignal.timeout(45000) });
  const result = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(result.error || 'No se pudo completar la operación.');
  return result;
 }
 async function busy(form, fn) {
  if (form.dataset.ocupado) return;
  form.dataset.ocupado = 'si'; const buttons = [...form.querySelectorAll('button')]; buttons.forEach(b => { b.disabled = true; });
  error('prospectos-error', '');
  try { await fn(); } catch (e) { error('prospectos-error', e.message || 'No se pudo guardar.'); }
  finally { delete form.dataset.ocupado; buttons.forEach(b => { b.disabled = false; }); }
 }
 function render() {
  const body = $('prospectos-filas'); body.replaceChildren();
  if (!rows.length) { const tr = document.createElement('tr'), td = node('td','Todavía no hay prospectos.','kw-universal-vacio'); td.colSpan = 6; tr.append(td); body.append(tr); return; }
  rows.forEach(p => {
   const tr = document.createElement('tr'), name = node('td',p.nombre), contact = node('td','','prospectos-contacto');
   contact.append(node('span',p.correo),node('span',p.telefono));
   const interest = node('td',p.interes);
   try { const url = new URL(p.inmueble_url); if (url.protocol === 'https:') { const a = node('a','Ver inmueble','prospectos-enlace'); a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; interest.append(a); } } catch {}
   const actions = node('td'), wrap = node('div','','prospectos-fila-acciones');
   const edit = node('button','Editar','prospectos-enlace'); edit.type = 'button'; edit.setAttribute('aria-label','Editar ' + p.nombre); edit.onclick = () => openForm(p);
   const remove = node('button','Eliminar','prospectos-enlace'); remove.type = 'button'; remove.setAttribute('aria-label','Eliminar ' + p.nombre);
   remove.onclick = async () => {
    if (!(await window.kwUI.confirm('¿Eliminar este prospecto?'))) return;
    remove.disabled = true;
    try { const r = await sb.from('prospectos_bandeja').delete().eq('id',p.id).eq('user_id',user.id); if (r.error) throw Error(); await loadRows(); }
    catch { error('prospectos-error','No se pudo eliminar el prospecto.'); }
    finally { remove.disabled = false; }
   };
   wrap.append(edit,remove); actions.append(wrap);
   const date = new Date(p.created_at); tr.append(name,contact,interest,node('td',p.origen),node('td',Number.isNaN(date.getTime())?'':date.toLocaleDateString('es-MX')),actions); body.append(tr);
  });
 }
 async function loadRows(more = false) {
  const r = ++revision; if (controller) controller.abort(); controller = new AbortController();
  $('vista-lista').setAttribute('aria-busy','true'); error('prospectos-error','');
  const offset = more ? rows.length : 0;
  if (!more) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 6; td.innerHTML = '<div class="kw-loader" aria-label="Cargando"><span class="punto"></span><span class="punto"></span><span class="punto"></span></div>'; tr.append(td); $('prospectos-filas').replaceChildren(tr); }
  try {
   let query = sb.from('prospectos_bandeja').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).order('id',{ascending:false});
   const text = $('buscador-input').value.replace(/[^\p{L}\p{N}@ .+\-]/gu,'').trim().slice(0,80);
   if (text) query = query.or(['nombre','correo','telefono','interes'].map(k => k + '.ilike.%' + text + '%').join(','));
   if ($('f-origen').value) query = query.eq('origen',$('f-origen').value);
   const result = await query.range(offset,offset + 99).abortSignal(controller.signal);
   if (r !== revision) return;
   if (result.error) throw Error();
   rows = more ? rows.concat(result.data || []) : result.data || []; $('prospectos-mas').hidden = (result.data || []).length < 100; render();
  } catch { if (r === revision) { render(); error('prospectos-error','No se pudieron cargar los prospectos. Usa Actualizar para reintentar.'); } }
  finally { if (r === revision) $('vista-lista').setAttribute('aria-busy','false'); }
 }
 function openForm(p) {
  editing = p?.id || null; $('prospecto-form').reset(); $('prospecto-form-titulo').textContent = editing ? 'Editar prospecto' : 'Nuevo prospecto';
  ['nombre','correo','telefono','origen','interes','notas'].forEach(k => { if (p) $('p-' + k).value = p[k] || ''; }); $('p-url').value = p?.inmueble_url || '';
  view('vista-formulario'); $('p-nombre').focus();
 }
 async function loadStatus() {
  error('gmail-error','');
  try {
   gmail = await api('estado'); $('gmail-estado').textContent = gmail.vinculada ? 'Cuenta vinculada' : 'Sin vincular'; $('gmail-correo').textContent = gmail.correo || ''; $('gmail-correo').hidden = !gmail.correo;
   $('gmail-conectar').hidden = !!gmail.vinculada; $('gmail-desconectar').hidden = !gmail.vinculada;
  } catch (e) { $('gmail-estado').textContent = 'No disponible'; error('gmail-error',e.message); }
 }
 async function loadRules() {
  const r = await sb.from('prospectos_reglas').select('remitentes,asuntos').eq('user_id',user.id).maybeSingle();
  if (r.error) throw Error('No se pudieron cargar las reglas.');
  $('r-remitentes').value = (r.data?.remitentes || []).join('\n'); $('r-asuntos').value = (r.data?.asuntos || []).join('\n');
 }
 function rules(value) {
  const lines = [...new Set(value.split(/[\n,]/).map(s => s.trim()).filter(Boolean))];
  if (lines.length > 30 || lines.some(s => s.length > 250)) throw Error('Usa hasta 30 reglas de 250 caracteres por campo.');
  return lines;
 }
 function bind() {
  $('btn-nuevo').onclick = () => openForm(null);
  document.querySelectorAll('[data-prospectos-volver]').forEach(b => { b.onclick = () => { $('g-client-secret').value = ''; view('vista-lista'); }; });
  $('prospectos-recargar').onclick = () => { view('vista-lista'); loadRows(); loadStatus(); };
  $('prospectos-mas').onclick = () => loadRows(true);
  $('buscador-input').oninput = () => { clearTimeout(timer); timer = setTimeout(() => loadRows(),250); };
  $('f-origen').onchange = () => loadRows();
  $('gmail-configurar').onclick = () => view('vista-gmail');
  $('gmail-reglas').onclick = async () => { try { await loadRules(); view('vista-reglas'); } catch (e) { error('prospectos-error',e.message); } };
  $('g-copiar').onclick = async () => { try { await navigator.clipboard.writeText($('g-redirect').value); $('g-copiar').textContent = 'URI copiada'; } catch { $('g-redirect').select(); } };
  $('gmail-conectar').onclick = async () => {
   if (!gmail?.configurada) { view('vista-gmail'); return; }
   $('gmail-conectar').disabled = true; error('gmail-error','');
   try { const r = await api('iniciar'), url = new URL(r.url); if (url.origin !== 'https://accounts.google.com' || url.pathname !== '/o/oauth2/v2/auth') throw Error('No se pudo abrir Google.'); location.assign(url.href); }
   catch (e) { error('gmail-error',e.message); }
   finally { $('gmail-conectar').disabled = false; }
  };
  $('gmail-desconectar').onclick = async () => {
   if (!(await window.kwUI.confirm('¿Desvincular Gmail de Prospectos?'))) return;
   $('gmail-desconectar').disabled = true;
   try { const r = await api('desconectar'); await loadStatus(); if (!r.revocada) error('gmail-error','Desconectado en KWEB. Google no confirmó la revocación; puedes retirar el acceso desde tu cuenta de Google.'); }
   catch (e) { error('gmail-error',e.message); }
   finally { $('gmail-desconectar').disabled = false; }
  };
  $('prospecto-form').onsubmit = e => { e.preventDefault(); busy(e.currentTarget,async () => {
   const data = { user_id:user.id, nombre:$('p-nombre').value.trim(), correo:$('p-correo').value.trim(), telefono:$('p-telefono').value.trim(), interes:$('p-interes').value.trim(), inmueble_url:$('p-url').value.trim(), origen:$('p-origen').value, notas:$('p-notas').value.trim(), updated_at:new Date().toISOString() };
   if (!data.correo && !data.telefono) throw Error('Agrega un correo o teléfono de contacto.');
   if (data.inmueble_url && new URL(data.inmueble_url).protocol !== 'https:') throw Error('El enlace del inmueble debe comenzar con https://.');
   const q = sb.from('prospectos_bandeja'), result = editing ? await q.update(data).eq('id',editing).eq('user_id',user.id).select('id') : await q.insert(data).select('id');
   if (result.error || !result.data?.length) throw Error('No se pudo guardar el prospecto.');
   view('vista-lista'); await loadRows();
  }); };
  $('gmail-config-form').onsubmit = e => { e.preventDefault(); busy(e.currentTarget,async () => {
   const config = { client_id:$('g-client-id').value.trim(), client_secret:$('g-client-secret').value.trim() }; $('g-client-secret').value = '';
   try { await api('configurar',config); await loadStatus(); view('vista-lista'); }
   finally { $('g-client-secret').value = ''; }
  }); };
  $('gmail-reglas-form').onsubmit = e => { e.preventDefault(); busy(e.currentTarget,async () => {
   const remitentes = rules($('r-remitentes').value), asuntos = rules($('r-asuntos').value);
   if (remitentes.some(s => !/^(?:[^\s@]+@)?(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(s))) throw Error('Usa correos o dominios válidos en los remitentes.');
   const r = await sb.from('prospectos_reglas').upsert({ user_id:user.id,remitentes,asuntos,updated_at:new Date().toISOString() });
   if (r.error) throw Error('No se pudieron guardar las reglas.'); view('vista-lista');
  }); };
 }
 async function init() {
  if (started) return; started = true; sb = window.kwSupabase;
  try {
   const u = await window.kwSession.usuarioInicial(sb); user = u.data?.user;
   if (u.error || !user) throw Error('No se pudo comprobar la sesión.');
   const access = await sb.rpc('prospectos_habilitado');
   if (access.error) throw Error('No se pudo comprobar el acceso. Recarga la página.');
   if (access.data !== true) { $('prospectos-acceso').textContent = 'No tienes acceso a este apartado.'; return; }
   $('prospectos-acceso').hidden = true; $('prospectos-app').hidden = false; bind();
   document.body.classList.add('prospectos-lista');
   await Promise.allSettled([loadRows(),loadStatus()]);
   if (callback.has('gmail_error')) error('gmail-error',callback.get('gmail_error') === 'cancelado' ? 'Cancelaste la vinculación con Google.' : 'El enlace de vinculación no es válido. Conecta Gmail nuevamente.');
   else if (callback.has('gmail_code') && callback.has('gmail_state')) {
    $('gmail-estado').textContent = 'Comprobando vinculación';
    try { await api('vincular',{code:callback.get('gmail_code'),state:callback.get('gmail_state')}); await loadStatus(); }
    catch (e) { $('gmail-estado').textContent = 'Sin vincular'; error('gmail-error',e.message); }
   }
   callback.delete('gmail_code'); callback.delete('gmail_state');
  } catch (e) { $('prospectos-acceso').textContent = e.message || 'No se pudo cargar Prospectos.'; }
 }
 if (document.documentElement.classList.contains('kw-auth-ok')) init();
 else window.addEventListener('kw-auth-ready',init,{once:true});
})();
