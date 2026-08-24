// ─────────────────────────────────────────────────────────────
// PRUEBA DE CARGA
// ─────────────────────────────────────────────────────────────
//
// Para qué sirve: responder "¿aguanta si se meten todos al mismo
// tiempo?" con números en vez de con una corazonada.
//
// Cómo se corre (hace falta Node instalado):
//
//     node herramientas/prueba-carga.mjs
//
// Tarda alrededor de un minuto. No hay nada que instalar.
//
// ─────────────────────────────────────────────────────────────
// IMPORTANTE, LÉASE ANTES DE CORRERLO
// ─────────────────────────────────────────────────────────────
//
// · SOLO LEE. No escribe, no borra, no toca ni un dato. Se puede
//   correr en producción sin miedo.
//
// · Solo consulta los dos endpoints que YA son públicos (el
//   directorio de asesores y las propiedades publicadas). Son los
//   mismos que cualquier visitante de la página pide al entrar, así
//   que esto no expone nada que no estuviera abierto.
//
// · Son ~500 peticiones en total. Para Supabase eso es tráfico
//   normal de un rato cualquiera, no un ataque. No dispara ninguna
//   alarma de abuso.
//
// ─────────────────────────────────────────────────────────────
// QUÉ PRUEBA Y QUÉ NO
// ─────────────────────────────────────────────────────────────
//
// SÍ prueba: cuánto tarda la base en responder cuando hay 10, 25 y
// 50 peticiones simultáneas, y si empieza a rechazar alguna.
//
// NO prueba: las pantallas que necesitan sesión (contratos,
// dictámenes, panel). Esas van por el mismo camino y la misma base,
// así que si las públicas responden bien con 50 en paralelo, las
// otras también; pero medirlas de verdad implicaría crear usuarios
// de prueba, y eso ensucia la base.
//
// ─────────────────────────────────────────────────────────────
// CÓMO LEER EL RESULTADO
// ─────────────────────────────────────────────────────────────
//
// p50 = la mitad de las peticiones tardaron menos que esto.
// p95 = 95 de cada 100 tardaron menos que esto. Este es el que
//       importa: es lo que siente la gente cuando le toca mala
//       suerte.
//
//   p95 debajo de 300ms .... va muy bien, ni se nota
//   p95 entre 300 y 800ms .. aceptable, se siente un pelín lento
//   p95 arriba de 1500ms ... hay que revisar
//   fallos > 0 ............. revisar el código de error de abajo
//
// Si salen errores 429, significa que Supabase está limitando por
// exceso de peticiones: es justo lo que se quería descubrir.

const URL_BASE = 'https://iloetojomzqtadkithtv.supabase.co/rest/v1';
const LLAVE = 'sb_publishable_ZvaIC0_lkd6OQ0VMihOvjA_BIgpbClq';

const CABECERAS = { apikey: LLAVE, Authorization: `Bearer ${LLAVE}` };

// Los mismos que pide el sitio al cargar sus páginas públicas.
const CONSULTAS = [
  { nombre: 'directorio de asesores', ruta: '/perfiles_publicos?select=id,nombre,apellido,role,foto_url,puesto&limit=50' },
  { nombre: 'propiedades publicadas', ruta: '/propiedades_publicas?select=*&limit=20' },
];

async function unaLlamada(consulta) {
  const t0 = performance.now();
  try {
    const res = await fetch(URL_BASE + consulta.ruta, { headers: CABECERAS });
    // Vaciar el cuerpo para medir la respuesta completa, no solo los headers.
    await res.arrayBuffer();
    return { ms: performance.now() - t0, status: res.status, ok: res.ok };
  } catch (err) {
    return { ms: performance.now() - t0, status: 0, ok: false, err: String(err.message || err) };
  }
}

function percentil(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

// Lanza `total` llamadas manteniendo `concurrencia` en vuelo a la vez.
async function ronda(concurrencia, total, consulta) {
  const resultados = [];
  let lanzadas = 0;
  const inicio = performance.now();

  async function trabajador() {
    while (lanzadas < total) {
      lanzadas++;
      resultados.push(await unaLlamada(consulta));
    }
  }
  await Promise.all(Array.from({ length: concurrencia }, trabajador));

  const segundos = (performance.now() - inicio) / 1000;
  const oks = resultados.filter((r) => r.ok);
  const tiempos = oks.map((r) => r.ms);
  const fallos = resultados.filter((r) => !r.ok);

  const porStatus = {};
  for (const r of fallos) porStatus[r.status] = (porStatus[r.status] || 0) + 1;

  return {
    concurrencia,
    total,
    ok: oks.length,
    fallos: fallos.length,
    porStatus,
    p50: Math.round(percentil(tiempos, 50)),
    p95: Math.round(percentil(tiempos, 95)),
    p99: Math.round(percentil(tiempos, 99)),
    max: Math.round(Math.max(0, ...tiempos)),
    rps: +(resultados.length / segundos).toFixed(1),
    segundos: +segundos.toFixed(1),
  };
}

const todas = [];
for (const consulta of CONSULTAS) {
  console.log(`\n${'='.repeat(66)}\n  ${consulta.nombre.toUpperCase()}\n${'='.repeat(66)}`);
  console.log('conc.  peticiones   ok  fallos    p50     p95     p99     max    req/s');
  console.log('-'.repeat(66));
  for (const c of [10, 25, 50]) {
    const r = await ronda(c, 84, consulta);
    todas.push({ ...r, consulta: consulta.nombre });
    console.log(
      String(r.concurrencia).padStart(4) +
      String(r.total).padStart(12) +
      String(r.ok).padStart(5) +
      String(r.fallos).padStart(8) +
      (r.p50 + 'ms').padStart(8) +
      (r.p95 + 'ms').padStart(8) +
      (r.p99 + 'ms').padStart(8) +
      (r.max + 'ms').padStart(8) +
      String(r.rps).padStart(9)
    );
    if (r.fallos) console.log(`       fallos por código: ${JSON.stringify(r.porStatus)}`);
    await new Promise((s) => setTimeout(s, 700)); // respirar entre rondas
  }
}

const totalPeticiones = todas.reduce((a, r) => a + r.total, 0);
const totalFallos = todas.reduce((a, r) => a + r.fallos, 0);
const peorP95 = Math.max(...todas.map((r) => r.p95));

console.log(`\n${'='.repeat(66)}`);
console.log(`TOTAL: ${totalPeticiones} peticiones, ${totalFallos} fallos ` +
            `(${((totalFallos / totalPeticiones) * 100).toFixed(1)}% de error)`);
console.log(`Peor p95 de todas las rondas: ${peorP95}ms`);

if (totalFallos === 0 && peorP95 < 800) {
  console.log('\nVEREDICTO: aguanta bien. Ni un fallo y los tiempos son buenos.');
} else if (totalFallos === 0) {
  console.log('\nVEREDICTO: no se cayó, pero va lento. Vale la pena revisar.');
} else {
  console.log('\nVEREDICTO: hubo fallos. Revisa los códigos de arriba ' +
              '(429 = te están limitando; 5xx = la base se atragantó).');
}
