// Centros de referencia proporcionados por el usuario; no son polígonos
// oficiales ni coordenadas verificadas de cada inmueble.
(function (global) {
  'use strict';
  var filas = [
    ['Cuauhtémoc','Roma Norte',19.4194,-99.1627],
    ['Cuauhtémoc','Roma Sur',19.4072,-99.1623],
    ['Cuauhtémoc','Condesa',19.4118,-99.1724],
    ['Cuauhtémoc','Hipódromo Condesa',19.4125,-99.1685],
    ['Cuauhtémoc','Juárez',19.4268,-99.1610],
    ['Cuauhtémoc','Cuauhtémoc',19.4312,-99.1672],
    ['Cuauhtémoc','Santa María la Ribera',19.4478,-99.1583],
    ['Benito Juárez','Del Valle Centro',19.3820,-99.1650],
    ['Benito Juárez','Del Valle Norte',19.3945,-99.1652],
    ['Benito Juárez','Del Valle Sur',19.3698,-99.1712],
    ['Benito Juárez','Narvarte Poniente',19.3942,-99.1565],
    ['Benito Juárez','Narvarte Oriente',19.3951,-99.1480],
    ['Benito Juárez','Nápoles',19.3928,-99.1772],
    ['Benito Juárez','Portales Norte',19.3732,-99.1448],
    ['Benito Juárez','Portales Sur',19.3645,-99.1462],
    ['Miguel Hidalgo','Polanco I Sección',19.4328,-99.2045],
    ['Miguel Hidalgo','Polanco V Sección',19.4335,-99.1905],
    ['Miguel Hidalgo','Anzures',19.4342,-99.1782],
    ['Miguel Hidalgo','San Miguel Chapultepec',19.4120,-99.1868],
    ['Miguel Hidalgo','Granada',19.4430,-99.1915],
    ['Coyoacán','Del Carmen',19.3548,-99.1625],
    ['Coyoacán','Coyoacán Centro',19.3502,-99.1618],
    ['Coyoacán','Campestre Churubusco',19.3490,-99.1385],
    ['Coyoacán','Pedregal de Santo Domingo',19.3285,-99.1628],
    ['Álvaro Obregón','San Ángel',19.3445,-99.1918],
    ['Álvaro Obregón','Florida',19.3562,-99.1785],
    ['Cuajimalpa','Bosques de las Lomas',19.3920,-99.2485],
    ['Cuajimalpa','Santa Fe',19.3595,-99.2612]
  ];
  function normalizar(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function buscar(estado,municipio,colonia) {
    if (normalizar(estado) !== 'ciudad de mexico') return null;
    var alcaldia = normalizar(municipio).replace(/^cuajimalpa de morelos$/,'cuajimalpa');
    var opciones = filas.filter(function (f) { return normalizar(f[1]) === normalizar(colonia) && (!alcaldia || normalizar(f[0]) === alcaldia); });
    return opciones.length === 1 ? { lat: opciones[0][2], lng: opciones[0][3] } : null;
  }
  function distancia(a,b) {
    var rad = Math.PI / 180, dlat = (b.lat-a.lat)*rad, dlon = (b.lng-a.lng)*rad;
    var h = Math.sin(dlat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;
    h = Math.max(0,Math.min(1,h));
    return 6371 * 2 * Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  }
  global.kwColonias = { buscar: buscar, distancia: distancia };
})(typeof window === 'undefined' ? globalThis : window);
