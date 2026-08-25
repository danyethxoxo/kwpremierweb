// ─────────────────────────────────────────────────────────────
// PRUEBA DE CARGA MIXTA (contra el proyecto de PRUEBAS)
// ─────────────────────────────────────────────────────────────
//
// Simula lo que pasaría un día pesado de verdad: varias personas
// creando documentos al mismo tiempo que otras están viendo la lista
// de usuarios y otras viendo firmas. Todo al mismo tiempo, no uno
// tras otro.
//
// Corre EXCLUSIVAMENTE contra el proyecto de pruebas
// (fuqhibgktfktnhefsbzz), nunca contra el real. Aun así, escribe
// documentos de verdad ahí (por eso hicimos el proyecto aparte).
//
// Cómo se corre:
//     node herramientas/prueba-carga-mixta.mjs
//
// ─────────────────────────────────────────────────────────────

const URL_BASE = 'https://fuqhibgktfktnhefsbzz.supabase.co';
const LLAVE = 'sb_publishable_iWCdkZkvF_mMGp8D1_VjFQ_DyoxlpYL';

// Las 3 que van a estar "creando documentos" al mismo tiempo.
const CUENTAS_ASESOR = [
  { email: 'prueba2@kwmexico.mx', password: '123456789' },
  { email: 'prueba3@kwmexico.mx', password: '123456789' },
  { email: 'prueba4@kwmexico.mx', password: '123456789' },
];
// La que está en "usuarios" y "firmas" al mismo tiempo.
const CUENTA_MASTER = { email: 'prueba1@kwmexico.mx', password: '123456789' };

const DOCS_POR_ASESOR = 7; // 3 × 7 = 21 documentos, ~"20 al mismo tiempo"
const CONSULTAS_MASTER = 10; // veces que revisa usuarios / firmas mientras tanto

async function iniciarSesion(cuenta) {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: LLAVE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cuenta.email, password: cuenta.password }),
  });
  const datos = await res.json();
  if (!res.ok) throw new Error(`No se pudo entrar como ${cuenta.email}: ${datos.error_description || datos.msg || res.status}`);
  return { token: datos.access_token, userId: datos.user.id };
}

async function medir(fn) {
  const t0 = performance.now();
  try {
    const r = await fn();
    return { ms: performance.now() - t0, ok: true, status: r.status };
  } catch (err) {
    return { ms: performance.now() - t0, ok: false, err: String(err.message || err) };
  }
}

function cabeceras(token) {
  return { apikey: LLAVE, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ── Escenario A: crear documentos ──
async function crearDocumento(token, userId, indice) {
  const res = await fetch(`${URL_BASE}/rest/v1/documentos_guardados`, {
    method: 'POST',
    headers: { ...cabeceras(token), Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      tipo_documento: 'PRUEBA_CARGA',
      nombre_archivo: `PRUEBA_CARGA_${Date.now()}_${indice}`,
      datos: { prueba: true, creado: new Date().toISOString() },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res;
}

// ── Escenario B: revisar usuarios (como el panel de Agregar usuarios) ──
async function verUsuarios(token) {
  const res = await fetch(
    `${URL_BASE}/rest/v1/profiles?select=id,nombre,apellido,email,role&order=created_at.desc&limit=50`,
    { headers: cabeceras(token) }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  await res.arrayBuffer();
  return res;
}

// ── Escenario C: revisar firmas ──
async function verFirmas(token) {
  const res = await fetch(`${URL_BASE}/rest/v1/firmas_documentos?select=*&limit=30`, {
    headers: cabeceras(token),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  await res.arrayBuffer();
  return res;
}

function resumen(nombre, resultados) {
  const oks = resultados.filter((r) => r.ok);
  const fallos = resultados.filter((r) => !r.ok);
  const tiempos = oks.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = tiempos[Math.floor(tiempos.length * 0.5)] || 0;
  const p95 = tiempos[Math.floor(tiempos.length * 0.95)] || 0;
  console.log(`\n${nombre}`);
  console.log(`  ${oks.length}/${resultados.length} exitosas` + (fallos.length ? `, ${fallos.length} FALLOS` : ''));
  console.log(`  p50: ${Math.round(p50)}ms   p95: ${Math.round(p95)}ms`);
  if (fallos.length) {
    console.log('  primeros errores:');
    fallos.slice(0, 3).forEach((f) => console.log(`    - ${f.err}`));
  }
  return { ok: oks.length, fallos: fallos.length };
}

console.log('Iniciando sesión en las 4 cuentas de prueba...');
const sesionesAsesor = await Promise.all(CUENTAS_ASESOR.map(iniciarSesion));
const sesionMaster = await iniciarSesion(CUENTA_MASTER);
console.log('Listas. Lanzando todo al mismo tiempo: documentos + usuarios + firmas...\n');

const inicio = performance.now();

// Todo esto sale disparado A LA VEZ, con Promise.all: ningún grupo
// espera a que el otro termine, exactamente como pasaría con gente
// real usando distintas pantallas al mismo tiempo.
const [resultadosDocumentos, resultadosUsuarios, resultadosFirmas] = await Promise.all([
  // Escenario A: 3 asesores creando documentos en paralelo entre sí.
  Promise.all(
    sesionesAsesor.flatMap((sesion) =>
      Array.from({ length: DOCS_POR_ASESOR }, (_, i) =>
        medir(() => crearDocumento(sesion.token, sesion.userId, i))
      )
    )
  ),
  // Escenario B: la cuenta master revisando usuarios varias veces.
  Promise.all(Array.from({ length: CONSULTAS_MASTER }, () => medir(() => verUsuarios(sesionMaster.token)))),
  // Escenario C: la misma cuenta, pero viendo firmas (piénsalo como
  // dos pestañas abiertas a la vez, o dos personas con el mismo rol).
  Promise.all(Array.from({ length: CONSULTAS_MASTER }, () => medir(() => verFirmas(sesionMaster.token)))),
]);

const segundosTotales = ((performance.now() - inicio) / 1000).toFixed(1);

console.log(`${'='.repeat(60)}`);
console.log(`TODO SE LANZÓ A LA VEZ Y TERMINÓ EN ${segundosTotales}s`);
console.log('='.repeat(60));

const a = resumen(`CREAR DOCUMENTOS  (${sesionesAsesor.length} personas × ${DOCS_POR_ASESOR} c/u = ${resultadosDocumentos.length} a la vez)`, resultadosDocumentos);
const b = resumen(`VER USUARIOS      (${CONSULTAS_MASTER} consultas mientras tanto)`, resultadosUsuarios);
const c = resumen(`VER FIRMAS        (${CONSULTAS_MASTER} consultas mientras tanto)`, resultadosFirmas);

const totalOk = a.ok + b.ok + c.ok;
const totalFallos = a.fallos + b.fallos + c.fallos;
const total = totalOk + totalFallos;

console.log(`\n${'='.repeat(60)}`);
console.log(`TOTAL: ${totalOk}/${total} exitosas, ${totalFallos} fallos`);
if (totalFallos === 0) {
  console.log('\nVEREDICTO: aguantó todo al mismo tiempo sin un solo fallo.');
} else {
  console.log('\nVEREDICTO: hubo fallos revisando lo de arriba. Revisa los mensajes de error.');
}

console.log(`\nSe crearon ${a.ok} documentos de prueba en la base. Como es el proyecto`);
console.log('de pruebas (no el real), no hace falta borrarlos: puedes dejarlos ahí,');
console.log('o simplemente borrar el proyecto entero de pruebas cuando ya no lo uses.');
