import fs from 'node:fs';

// Base OpenFreeMap Liberty. El estilo se congela localmente; solo se consultan
// teselas, glifos e iconos del proveedor al navegar por el mapa.
const response = await fetch('https://tiles.openfreemap.org/styles/liberty');
if (!response.ok) throw new Error('No se pudo descargar el estilo base');
const style = await response.json();
style.name = 'KW Premier: entorno de la propiedad';
const template = style.layers.find(layer => layer.id === 'poi_r1');
style.layers = style.layers.filter(layer => layer['source-layer'] !== 'poi' && layer['source-layer'] !== 'housenumber' && !layer.id.startsWith('road_one_way'));
for (const layer of style.layers) {
  if (layer.type === 'symbol' && layer.layout?.['text-field']) {
    layer.layout['text-field'] = ['coalesce', ['get', 'name:es'], ['get', 'name'], ['get', 'name:latin']];
  }
  if (layer.id === 'background') layer.paint['background-color'] = '#f7f7f2';
  if (layer.id === 'landuse_residential') layer.paint['fill-color'] = '#f0efeb';
  if (layer.id === 'landuse_hospital') layer.paint['fill-color'] = '#f8e5e7';
  if (layer.id === 'park') Object.assign(layer.paint, {'fill-color':'#d5e8ce','fill-opacity':0.85,'fill-outline-color':'#bbd5b0'});
  if (layer.id === 'highway-name-minor') {
    layer.minzoom = 16;
    layer.layout['symbol-spacing'] = 350;
    layer.paint['text-color'] = '#858580';
  }
  if (layer.id === 'highway-name-path') layer.minzoom = 17;
  if (layer['source-layer'] === 'building') layer.minzoom = Math.max(16,layer.minzoom || 0);
  if (layer['source-layer'] === 'place' && /neighbourhood|suburb/.test(layer.id)) {
    layer.paint['text-color'] = '#95948d';
  }
}
const categories = [
  {id:'autobuses',classes:['bus'],zoom:16.5,color:'#648397'},
  {id:'parques',classes:['park'],zoom:13,color:'#477b42'},
  {id:'educacion',classes:['college','school'],zoom:15,color:'#786291'},
  {id:'interes',classes:['attraction','museum','library','stadium','town_hall'],zoom:15,color:'#82704f'},
  {id:'salud',classes:['hospital'],zoom:13,color:'#b64c60'},
  {id:'transporte',classes:['railway','rail','airport'],zoom:12,color:'#376b91'},
];
for (const category of categories) {
  const layer = structuredClone(template);
  layer.id = 'kw-entorno-' + category.id;
  layer.minzoom = category.zoom;
  layer.filter = ['all', ['has','name'], ['match',['get','class'],category.classes,true,false]];
  Object.assign(layer.layout, {
    'text-field':['coalesce',['get','name:es'],['get','name'],['get','name:latin']],
    'text-font':['Noto Sans Regular'], 'text-size':12, 'text-max-width':12,
    'text-padding':5, 'icon-padding':4, 'icon-size':0.9,
    'text-optional':false, 'icon-optional':true,
    'symbol-sort-key':['coalesce',['get','rank'],100],
  });
  Object.assign(layer.paint, {'text-color':category.color,'text-halo-color':'#fff','text-halo-width':1.6});
  style.layers.push(layer);
}
fs.mkdirSync(new URL('../assets/data/mapa/', import.meta.url), {recursive:true});
fs.writeFileSync(new URL('../assets/data/mapa/entorno.json', import.meta.url), JSON.stringify(style));
console.log('Estilo de entorno generado.');
