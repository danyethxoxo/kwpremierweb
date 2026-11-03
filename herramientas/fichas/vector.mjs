import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import logo from './logo.json';

export function dibujarLogo(ctx, x, y, width, blanco = false) {
  ctx.save(); ctx.translate(x, y); ctx.scale(width / logo.width, width / logo.width);
  for (const group of logo.groups) {
    ctx.fillStyle = blanco ? '#ffffff' : group.color; ctx.beginPath();
    for (const ring of group.rings) {
      ctx.moveTo(...ring[0]);
      for (let i = 1; i < ring.length; i++) ctx.lineTo(...ring[i]);
      ctx.closePath();
    }
    ctx.fill();
  }
  ctx.restore();
}

let catalogo;
async function respuesta(url, tipo) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('Mapa vectorial no disponible');
  return tipo === 'json' ? r.json() : r.arrayBuffer();
}

export async function cargarMapa(coordenadas) {
  const zoom = 16, z = 14, n = 2 ** z, rad = coordenadas.lat * Math.PI / 180;
  const cx = (coordenadas.lng + 180) / 360 * n * 256;
  const cy = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n * 256;
  const scale = 2 ** (zoom - z), width = 1072, height = 310;
  const left = cx - width / scale / 2, top = cy - height / scale / 2;
  if (!catalogo) catalogo = respuesta('https://tiles.openfreemap.org/planet', 'json').catch(e => { catalogo = null; throw e; });
  const meta = await catalogo, solicitudes = [];
  for (let x = Math.floor(left / 256); x <= Math.floor((left + width / scale) / 256); x++) {
    for (let y = Math.floor(top / 256); y <= Math.floor((top + height / scale) / 256); y++) solicitudes.push({ x, y });
  }
  const scene = { width, height, features: [] };
  // At most four requests run concurrently, including cross-tile views.
  for (let i = 0; i < solicitudes.length; i += 4) {
    await Promise.all(solicitudes.slice(i, i + 4).map(async ({ x, y }) => {
      const url = meta.tiles[0].replace('{z}', z).replace('{x}', ((x % n) + n) % n).replace('{y}', y);
      const tile = new VectorTile(new PbfReader(new Uint8Array(await respuesta(url))));
      for (const name of ['landcover', 'landuse', 'water', 'waterway', 'building', 'transportation', 'transportation_name', 'place', 'poi']) {
        const layer = tile.layers[name]; if (!layer) continue;
        for (let k = 0; k < layer.length; k++) {
          const f = layer.feature(k), box = f.bbox(), unit = 256 / layer.extent;
          const px = a => (x * 256 + a * unit - left) * scale;
          const py = a => (y * 256 + a * unit - top) * scale;
          if (px(box[2]) < -40 || px(box[0]) > width + 40 || py(box[3]) < -40 || py(box[1]) > height + 40) continue;
          scene.features.push({ layer: name, type: f.type, properties: f.properties, geometry: f.loadGeometry().map(ring => ring.map(p => [px(p.x), py(p.y)])) });
        }
      }
    }));
  }
  return scene;
}

export function dibujarMapa(ctx, scene, x, y, width, height) {
  ctx.save(); ctx.translate(x, y); ctx.scale(width / scene.width, height / scene.height);
  ctx.beginPath(); ctx.rect(0, 0, scene.width, scene.height); ctx.clip();
  ctx.fillStyle = '#f2f0eb'; ctx.fillRect(0, 0, scene.width, scene.height);
  const paths = f => {
    ctx.beginPath();
    for (const ring of f.geometry) {
      if (!ring.length) continue;
      ctx.moveTo(...ring[0]);
      for (let i = 1; i < ring.length; i++) ctx.lineTo(...ring[i]);
      if (f.type === 3) ctx.closePath();
    }
  };
  for (const layer of ['landcover', 'landuse', 'water', 'waterway', 'building', 'transportation']) {
    const fs = scene.features.filter(f => f.layer === layer);
    for (const f of fs) {
      const c = String(f.properties.class || '');
      if (f.type === 3) {
        if (layer === 'landcover' || layer === 'landuse') ctx.fillStyle = /grass|wood|forest|park|recreation|cemetery/.test(c) ? '#d8e7cd' : '#ebe8df';
        else ctx.fillStyle = layer === 'water' ? '#b9dae9' : '#e1ddd5';
        paths(f); ctx.fill();
      } else if (layer === 'waterway') { paths(f); ctx.strokeStyle = '#b9dae9'; ctx.lineWidth = 3; ctx.stroke(); }
    }
    if (layer === 'transportation') {
      const roadWidth = c => /motorway|trunk/.test(c) ? 13 : /primary|secondary/.test(c) ? 10 : /tertiary/.test(c) ? 8 : /path|track|footway/.test(c) ? 2 : 6;
      for (const outline of [true, false]) for (const f of fs) if (f.type === 2) {
        const c = String(f.properties.class || ''); paths(f);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = roadWidth(c) + (outline ? 2 : 0);
        ctx.strokeStyle = outline ? '#d8d4ca' : /motorway|trunk|primary/.test(c) ? '#f6dda4' : '#ffffff'; ctx.stroke();
      }
    }
  }
  const occupied = [], seen = new Set();
  const label = (name, point, size, color, poi = false) => {
    if (!name || seen.has(name) || point[0] < 15 || point[0] > scene.width - 15 || point[1] < 20 || point[1] > scene.height - 20) return;
    ctx.font = '400 ' + size + 'px PoppinsFicha';
    const w = ctx.measureText(name).width, b = [point[0] - w / 2 - 8, point[1] - size - 5, point[0] + w / 2 + 8, point[1] + 8];
    if (b[0] < 4 || b[2] > scene.width - 4 || occupied.some(a => b[0] < a[2] && b[2] > a[0] && b[1] < a[3] && b[3] > a[1])) return;
    occupied.push(b); seen.add(name);
    if (poi) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(point[0], point[1] - size - 10, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(name, point[0], point[1]); ctx.textAlign = 'left';
  };
  const nombre = p => p['name:es'] || p.name || '';
  const pois = scene.features.filter(f => f.layer === 'poi' && nombre(f.properties)).sort((a, b) => Number(a.properties.rank || 99) - Number(b.properties.rank || 99));
  for (const f of pois) { if (occupied.length >= 8) break; label(nombre(f.properties), f.geometry[0][0], 15, '#79608c', true); }
  for (const f of scene.features.filter(f => f.layer === 'place')) label(nombre(f.properties), f.geometry[0][0], 16, '#7b7b73');
  for (const f of scene.features.filter(f => f.layer === 'transportation_name')) {
    const ring = f.geometry.slice().sort((a, b) => b.length - a.length)[0]; if (!ring?.length) continue;
    label(nombre(f.properties), ring[Math.floor(ring.length / 2)], 12, '#777777');
  }
  ctx.restore();
}
