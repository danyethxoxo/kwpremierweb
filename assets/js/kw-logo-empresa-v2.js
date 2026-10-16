(function(global){
  'use strict';
  let logo='', bloqueado=false, version=0, ocupado=false, cargando=false;
  const valido=v=>typeof v==='string'&&v.length<250000&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v)?v:'';
  function refrescar(){
    const caja=document.getElementById('kw-logo-empresa');if(!caja)return;
    const img=caja.querySelector('img');if(logo)img.src=logo;else img.removeAttribute('src');
    caja.querySelector('[data-logo-subir]').hidden=!!logo;
    caja.querySelector('[data-logo-miniatura]').hidden=!logo;
    caja.setAttribute('aria-busy',String(ocupado));
    caja.querySelector('input').disabled=bloqueado||ocupado;
    caja.querySelector('[data-logo-subir]').disabled=bloqueado||ocupado;
    caja.querySelector('[data-logo-quitar]').disabled=bloqueado||ocupado||!logo;
    document.querySelectorAll('.kw-logo-empresa-hoja').forEach(el=>el.remove());
    if(logo)document.querySelectorAll('.kw-contrato-hoja').forEach(hoja=>insertar(hoja));
    document.dispatchEvent(new CustomEvent('kw-contrato-render'));
  }
  function insertar(hoja){if(!logo)return;const img=document.createElement('img');img.className='kw-logo-empresa-hoja';img.src=logo;img.alt='Logo de tu empresa';img.style.cssText='position:absolute!important;top:30px!important;right:72px!important;left:auto!important;width:107.8px!important;height:41.8px!important;object-fit:contain!important;margin:0!important;';hoja.appendChild(img);}
  async function usuario(){const r=await global.kwSupabase.auth.getUser();if(r.error||!r.data?.user)throw new Error('No se pudo verificar tu cuenta.');return r.data.user;}
  async function cargar(datos,soloLectura=false,nuevo=false){
    const turno=++version;bloqueado=soloLectura;logo=valido(datos?.logo_empresa);cargando=nuevo;refrescar();
    if(!nuevo)return;
    try{const u=await usuario();const url=u.user_metadata?.kw_logo_empresa_url;if(!url)return;
      const base=global.kwSupabase.storage.from('perfiles').getPublicUrl(u.id+'/').data.publicUrl;
      if(!url.startsWith(base))return;
      const r=await fetch(url);if(!r.ok)throw new Error('No se pudo cargar tu logo guardado.');
      const blob=await r.blob();const valor=await normalizar(blob);
      if(turno!==version)return;logo=valor;refrescar();
    }catch(e){if(turno===version)aviso(e.message);}
    finally{if(turno===version)cargando=false;}
  }
  function aviso(texto){const el=document.querySelector('#kw-logo-empresa [role="status"]');if(el){el.textContent=texto;el.hidden=!texto;}}
  async function normalizar(archivo){
    if(!['image/png','image/jpeg','image/webp'].includes(archivo.type)||archivo.size>5*1024*1024)throw new Error('Elige una imagen PNG, JPG o WebP de hasta 5 MB.');
    const url=URL.createObjectURL(archivo);try{const img=new Image();img.src=url;await img.decode();if(!img.naturalWidth||img.naturalWidth*img.naturalHeight>40000000)throw new Error('La imagen es demasiado grande.');
      const canvas=document.createElement('canvas');canvas.width=294;canvas.height=114;const ctx=canvas.getContext('2d'),escala=Math.min(294/img.naturalWidth,114/img.naturalHeight),w=img.naturalWidth*escala,h=img.naturalHeight*escala;ctx.drawImage(img,(294-w)/2,(114-h)/2,w,h);return canvas.toDataURL('image/png');
    }finally{URL.revokeObjectURL(url);}
  }
  async function cambiar(archivo){
    if(ocupado||bloqueado)return;ocupado=true;cargando=false;const turno=++version;refrescar();aviso('');
    try{const valor=archivo?await normalizar(archivo):'',u=await usuario();
      let url=null;if(valor){const blob=await(await fetch(valor)).blob(),ruta=u.id+'/logo-empresa-'+crypto.randomUUID()+'.png';
        const subida=await global.kwSupabase.storage.from('perfiles').upload(ruta,blob,{contentType:'image/png',cacheControl:'31536000'});if(subida.error)throw subida.error;
        url=global.kwSupabase.storage.from('perfiles').getPublicUrl(ruta).data.publicUrl;
      }
      const sesion=await usuario();if(sesion.id!==u.id)throw new Error('La cuenta cambió. Vuelve a abrir el contrato.');
      const r=await global.kwSupabase.auth.updateUser({data:{kw_logo_empresa_url:url}});if(r.error)throw r.error;
      if(turno!==version)return;
      logo=valor;refrescar();document.dispatchEvent(new CustomEvent('kw-logo-empresa-cambio'));aviso('');
    }catch(e){aviso(e.message||'No se pudo guardar el logo. Intenta de nuevo.');}
    finally{ocupado=false;refrescar();}
  }
  function montar(){const perfil=document.querySelector('[data-kw-logo-perfil]');const raiz=perfil||document.querySelector('#acuerdos-form-col .kw-form-scroll')||document.getElementById('acuerdos-form-col');if(!raiz)return;
    const caja=document.createElement('div');caja.id='kw-logo-empresa';caja.className='kw-logo-control';caja.setAttribute('role','group');caja.setAttribute('aria-label','Logo de tu empresa');
    caja.innerHTML='<input id="kw-logo-empresa-archivo" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Elegir logo" hidden><button type="button" data-logo-subir><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></svg>Subir logo</button><div data-logo-miniatura hidden><img alt="Logo de tu empresa" width="98" height="38"><button type="button" data-logo-quitar aria-label="Eliminar logo" title="Eliminar logo"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><p role="status" aria-live="polite" hidden></p>';
    raiz.appendChild(caja);caja.querySelector('input').onchange=e=>{const archivo=e.target.files[0];if(archivo)cambiar(archivo);e.target.value='';};caja.querySelector('[data-logo-subir]').onclick=()=>caja.querySelector('input').click();caja.querySelector('[data-logo-quitar]').onclick=()=>cambiar(null);refrescar();
    if(perfil){if(document.documentElement.classList.contains('kw-auth-ok'))cargar(null,false,true);else window.addEventListener('kw-auth-ready',()=>cargar(null,false,true),{once:true});}
  }
  global.kwLogoEmpresa={cargar,obtener:()=>logo,insertar,pendiente:()=>ocupado||cargando,bloquear:valor=>{bloqueado=valor;refrescar();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',montar);else montar();
})(window);
