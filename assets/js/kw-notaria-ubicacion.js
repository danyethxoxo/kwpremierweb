(function(global){
  'use strict';
  const id=n=>document.getElementById(n);
  const OTRA='__kw_otra_ciudad__';
  let catalogo=null,consulta=null,pintando=false;
  const normalizar=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  function ciudadesPara(datos,estado){
    const entidad=datos?.estados?.find(e=>normalizar(e.nombre)===normalizar(estado)||e.id===estado);
    if(!entidad)return [];
    return [...new Set((datos.municipios||[]).filter(m=>m.estado===entidad.id).map(m=>m.nombre))].sort((a,b)=>a.localeCompare(b,'es'));
  }
  function refrescar(){
    const estado=id('f-notario-estado'),ciudad=id('f-notario-ciudad'),lista=id('f-notario-ciudad-lista');
    if(!estado||!ciudad||!lista)return;
    pintando=true;
    try{
      const anterior=ciudad.value||'',nombres=ciudadesPara(catalogo,estado.value);
      lista.replaceChildren(new Option('Seleccionar ciudad',''));
      for(const nombre of nombres)lista.add(new Option(nombre,nombre));
      // La ciudad de un documento anterior se conserva aunque no esté en el catálogo municipal.
      if(anterior&&!nombres.includes(anterior))lista.add(new Option(anterior,anterior));
      lista.add(new Option('Otra ciudad…',OTRA));
      lista.value=anterior;
      id('f-notario-ciudad-otra-campo').hidden=true;
      id('f-notario-ciudad-otra').value='';
      global.kwUI?.selects(id('notaria-ubicacion'));
      [estado,lista].forEach(select=>{
        global.kwSelectBusqueda?.preparar(select);
        select.dispatchEvent(new Event('change',{bubbles:true}));
      });
      global.kwProfecoForm?.menus();
    }finally{pintando=false;}
  }
  function avisar(){id('f-notario-ciudad').dispatchEvent(new Event('input',{bubbles:true}));}
  async function cargar(){
    if(consulta)return consulta;
    consulta=(async()=>{
      try{
        const res=await fetch('/assets/data/limites-mx/indice.json',{credentials:'same-origin'});
        if(!res.ok)throw new Error('catalogo');
        const datos=await res.json();
        if(!Array.isArray(datos.estados)||!Array.isArray(datos.municipios))throw new Error('catalogo');
        catalogo=datos;id('notaria-catalogo-error').hidden=true;refrescar();
      }catch{
        consulta=null;id('notaria-catalogo-error').hidden=false;
      }
    })();
    return consulta;
  }
  function iniciar(){
    if(!id('notaria-ubicacion'))return;
    id('f-notario-estado').addEventListener('change',()=>{
      if(pintando)return;
      id('f-notario-ciudad').value='';refrescar();avisar();
    });
    id('f-notario-ciudad-lista').addEventListener('change',()=>{
      if(pintando)return;
      const otra=id('f-notario-ciudad-lista').value===OTRA;
      id('f-notario-ciudad-otra-campo').hidden=!otra;
      id('f-notario-ciudad').value=otra?id('f-notario-ciudad-otra').value:id('f-notario-ciudad-lista').value;
      avisar();if(otra)id('f-notario-ciudad-otra').focus();
    });
    id('f-notario-ciudad-otra').addEventListener('input',()=>{
      id('f-notario-ciudad').value=id('f-notario-ciudad-otra').value.trim();avisar();
    });
    id('notaria-catalogo-reintentar').addEventListener('click',()=>{cargar();});
    refrescar();cargar();
  }
  global.kwNotariaUbicacion={refrescar,cargar,ciudadesPara};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);
  else iniciar();
})(window);
