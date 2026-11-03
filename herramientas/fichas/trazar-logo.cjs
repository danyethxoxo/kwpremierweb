const fs = require('fs');
const sharp = require('sharp');
function simplificar(points, tolerancia = .6) {
  if (points.length <= 2) return points;
  const a = points[0], b = points[points.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], longitud = dx * dx + dy * dy;
  let distancia = 0, indice = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], t = longitud ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / longitud)) : 0;
    const d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    if (d > distancia) { distancia = d; indice = i; }
  }
  if (distancia <= tolerancia) return [a, b];
  return simplificar(points.slice(0, indice + 1), tolerancia).slice(0, -1).concat(simplificar(points.slice(indice), tolerancia));
}
// Preserve the existing two-color artwork as closed vector contours.
(async () => {
  const { data, info } = await sharp('assets/img/logo-kw-premier.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const groups = [];
  for (const color of ['#CE011F', '#373736', '#878786']) {
    const edges = new Map(), w = info.width, h = info.height;
    const inside = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      const i = (y * w + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      const red = r > g * 1.5 && r > b * 1.4;
      return data[i + 3] >= 100 && (color === '#CE011F' ? red : !red && (color === '#373736' ? y < 166 : y >= 166)) && Math.min(r, g, b) < 200;
    };
    const edge = (a, b) => { const k = a.join(','); if (!edges.has(k)) edges.set(k, []); edges.get(k).push(b); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y)) {
      if (!inside(x, y - 1)) edge([x, y], [x + 1, y]);
      if (!inside(x + 1, y)) edge([x + 1, y], [x + 1, y + 1]);
      if (!inside(x, y + 1)) edge([x + 1, y + 1], [x, y + 1]);
      if (!inside(x - 1, y)) edge([x, y + 1], [x, y]);
    }
    const rings = [];
    while (edges.size) {
      const key = edges.keys().next().value, start = key.split(',').map(Number), ring = [start];
      let current = start;
      do {
        const k = current.join(','), next = edges.get(k);
        if (!next) break;
        current = next.pop(); if (!next.length) edges.delete(k);
        ring.push(current);
      } while (current[0] !== start[0] || current[1] !== start[1]);
      const simple = ring.filter((p, i) => {
        if (!i || i === ring.length - 1) return true;
        const a = ring[i - 1], b = ring[i + 1];
        return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
      });
      if (simple.length >= 4) {
        const medio = Math.floor(simple.length / 2);
        rings.push(simplificar(simple.slice(0, medio + 1)).slice(0, -1).concat(simplificar(simple.slice(medio))));
      }
    }
    groups.push({ color, rings });
  }
  const logo = { width: info.width, height: info.height, groups };
  fs.writeFileSync('herramientas/fichas/logo.json', JSON.stringify(logo));
  const paths = groups.map(g => '<path fill="' + g.color + '" d="' + g.rings.map(r => 'M' + r.map(p => p.join(' ')).join('L') + 'Z').join('') + '"/>').join('');
  fs.writeFileSync('assets/img/logo-kw-premier-vector.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + info.width + ' ' + info.height + '">' + paths + '</svg>');
  console.log('Logo traced:', groups.map(g => ({ color: g.color, rings: g.rings.length })));
})();
