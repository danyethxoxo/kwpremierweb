(function(global){
  'use strict';
  const divisas={MXN:{nombre:'PESOS',cierre:'M.N.'},USD:{nombre:'DÓLARES ESTADOUNIDENSES',cierre:'USD'},EUR:{nombre:'EUROS',cierre:'EUR'}};
  const estados=['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua','Ciudad de México','Coahuila de Zaragoza','Colima','Durango','Estado de México','Guanajuato','Guerrero','Hidalgo','Jalisco','Michoacán de Ocampo','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz de Ignacio de la Llave','Yucatán','Zacatecas'];
  const civiles=['Soltero(a)','Casado(a) por sociedad conyugal','Casado(a) por separación de bienes','Divorciado(a)','Viudo(a)','Unión libre'];
  const inmuebles=['Local comercial','Oficina','Terreno','Bodega','Nave industrial','Edificio comercial','Consultorio','Consultorio médico','Hotel','Restaurante','Otro inmueble comercial'];
  let consultaPerfil;
  async function perfil(){
    if(!consultaPerfil)consultaPerfil=(async()=>{
      const u=await (global.kwSession?.usuarioInicial ? global.kwSession.usuarioInicial(global.kwSupabase) : global.kwSupabase.auth.getUser());if(u.error||!u.data.user)return {};
      const r=await (global.kwSession?.perfilInicial ? global.kwSession.perfilInicial(global.kwSupabase) : global.kwSupabase.from('profiles').select('nombre,apellido,email,whatsapp').eq('id',u.data.user.id).single());
      if(r.error)throw r.error;
      return {...r.data,nombre:[r.data?.nombre,r.data?.apellido].filter(Boolean).join(' ').trim(),email:r.data?.email||u.data.user.email||''};
    })().catch(()=>{consultaPerfil=null;return {};});
    return consultaPerfil;
  }
  async function prellenar(mapa){
    const vacios=Object.entries(mapa).filter(([id])=>!document.getElementById(id)?.value.trim());
    const p=await perfil();
    for(const [id,campo]of vacios){const el=document.getElementById(id);if(el&&!el.value.trim()&&p[campo]){el.value=p[campo];el.dispatchEvent(new CustomEvent('input',{bubbles:true,detail:{origen:'perfil'}}));}}
  }
  function formatear(input){
    const anterior=input.value,pos=input.selectionStart??anterior.length,digitos=(anterior.slice(0,pos).match(/\d/g)||[]).length;
    const limpio=anterior.replace(/[^\d.]/g,''),partes=limpio.split('.');
    input.value=partes[0].replace(/^0+(?=\d)/,'').replace(/\B(?=(\d{3})+(?!\d))/g,',')+(partes.length>1?'.'+partes.slice(1).join('').slice(0,2):'');
    if(document.activeElement===input){let i=0,n=0;while(i<input.value.length&&n<digitos){if(/\d/.test(input.value[i]))n++;i++;}if(anterior[pos-1]==='.'&&input.value[i]==='.')i++;input.setSelectionRange(i,i);}
  }
  global.kwDocumentosCampos={divisas,estados,civiles,inmuebles,perfil,prellenar,formatear};
})(window);
