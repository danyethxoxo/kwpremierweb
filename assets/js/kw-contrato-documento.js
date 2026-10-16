(function(global){
  'use strict';
  const pendientes=new Map();
  let logoPendiente;
  function logoParaPDF(){
    if(!logoPendiente)logoPendiente=fetch('/assets/img/logo-kw-premier.png').then(async r=>{
      if(!r.ok)throw new Error('No se pudo cargar el logo del contrato. Vuelve a intentar.');
      const blob=new Blob([await r.arrayBuffer()],{type:'image/png'});
      return new Promise((resolve,reject)=>{const lector=new FileReader();lector.onload=()=>resolve(lector.result);lector.onerror=reject;lector.readAsDataURL(blob);});
    }).catch(error=>{logoPendiente=null;throw error;});
    return logoPendiente;
  }
  function sincronizar(destino,origen){
    if(destino.nodeType===3){if(destino.nodeValue!==origen.nodeValue)destino.nodeValue=origen.nodeValue;return;}
    for(const a of Array.from(destino.attributes))if(!origen.hasAttribute(a.name))destino.removeAttribute(a.name);
    for(const a of Array.from(origen.attributes))if(destino.getAttribute(a.name)!==a.value)destino.setAttribute(a.name,a.value);
    for(let i=0;i<origen.childNodes.length;i++){
      const a=destino.childNodes[i],b=origen.childNodes[i];
      if(!a)destino.appendChild(b.cloneNode(true));else if(a.nodeType!==b.nodeType||a.nodeName!==b.nodeName)a.replaceWith(b.cloneNode(true));else sincronizar(a,b);
    }
    while(destino.childNodes.length>origen.childNodes.length)destino.lastChild.remove();
  }
  function bloquesDe(raw){
    const salida=[];
    for(const node of raw.children){
      if(node.matches('.doc-header'))continue;
      if(node.matches('.doc-firmas-wrap:not([data-kw-firmas])')){for(const fila of node.children)salida.push(fila.cloneNode(true));}
      else salida.push(node.cloneNode(true));
    }
    for(const bloque of salida)bloque.querySelectorAll('.doc-campo:not(.filled)').forEach(el=>{el.textContent='________________';});
    return salida;
  }
  function render(config){
    clearTimeout(pendientes.get(config.stack));pendientes.delete(config.stack);
    const stack=document.getElementById(config.stack);if(!stack)return;
    const medidor=document.createElement('div');medidor.className='kw-contrato-medidor';document.body.appendChild(medidor);
    const paginas=[];
    function nueva(){
      const hoja=document.createElement('article');hoja.className='page kw-contrato-hoja '+(config.clase||'');
      const cabecera=document.createElement('header');cabecera.className='doc-header kw-contrato-encabezado';
      const img=document.createElement('img');img.src='/assets/img/logo-kw-premier.png';img.alt='KW Premier';
      cabecera.append(img);
      const cuerpo=document.createElement('div');cuerpo.className='kw-contrato-cuerpo '+(config.claseCuerpo||'');
      const pie=document.createElement('footer');pie.className='kw-contrato-pie';
      const folio=document.createElement('span');folio.textContent=config.folio||'Borrador';pie.append(folio,document.createElement('span'));
      hoja.append(cabecera,cuerpo,pie);global.kwLogoEmpresa?.insertar(hoja);medidor.appendChild(hoja);paginas.push(hoja);return cuerpo;
    }
    let cuerpo=nueva();
    const excede=()=>cuerpo.getBoundingClientRect().bottom-cuerpo.parentElement.getBoundingClientRect().top>990;
    function agregar(bloque){
      if(bloque.matches('.doc-salto')){if(cuerpo.children.length)cuerpo=nueva();return;}
      cuerpo.appendChild(bloque);
      if(!excede())return;
      if(cuerpo.children.length>1){bloque.remove();cuerpo=nueva();cuerpo.appendChild(bloque);if(!excede())return;}
      // Los anexos y las firmas pueden crecer con el número de clientes.
      if((bloque.children.length>1||bloque.matches('table'))&&!bloque.matches('p,.doc-p,.doc-intro')){
        bloque.remove();
        if(!bloque.matches('table,ul,ol')){for(const hijo of Array.from(bloque.children))agregar(hijo);return;}
        const hijos=Array.from(bloque.matches('table')?bloque.querySelectorAll('tr'):bloque.children);
        let fragmento=bloque.cloneNode(false);cuerpo.appendChild(fragmento);
        for(const hijo of hijos){fragmento.appendChild(hijo);if(excede()&&fragmento.children.length>1){hijo.remove();cuerpo=nueva();fragmento=bloque.cloneNode(false);fragmento.appendChild(hijo);cuerpo.appendChild(fragmento);}}
      }else if(excede()&&bloque.textContent.split(/\s+/).length>1){
        // Conservar el marcado al dividir textos excepcionalmente largos.
        bloque.remove();const resto=bloque.cloneNode(true);
        while(resto.textContent.trim()){
          const texto=resto.textContent;const cortes=Array.from(texto.matchAll(/\s+/g),m=>m.index).filter(i=>i>0);cortes.push(texto.length);
          let bajo=0,alto=cortes.length-1,mejor=-1;
          while(bajo<=alto){const medio=(bajo+alto)>>1;const prueba=porcion(resto,cortes[medio]);cuerpo.appendChild(prueba);const cabe=!excede();prueba.remove();if(cabe){mejor=medio;bajo=medio+1;}else alto=medio-1;}
          if(mejor<0)throw new Error('Hay contenido que no cabe en una hoja del contrato.');
          cuerpo.appendChild(porcion(resto,cortes[mejor],true));if(resto.textContent.trim())cuerpo=nueva();
        }
      }else throw new Error('Hay contenido que no cabe en una hoja del contrato.');
    }
    try{
      const bloques=config.bloques?config.bloques():bloquesDe(document.getElementById(config.raw));
      for(let i=0;i<bloques.length;i++){
        let bloque=bloques[i];
        if(bloque.matches('h3,.doc-seccion')&&bloques[i+1]&&!bloques[i+1].matches('.doc-salto')){const grupo=document.createElement('div');grupo.append(bloque,bloques[++i]);bloque=grupo;}
        agregar(bloque);
      }
      if(paginas.length>1&&!cuerpo.children.length)paginas.pop().remove();
      for(const hoja of paginas){
        const firmas=hoja.querySelector('[data-kw-firmas="pie"]');
        if(firmas?.previousElementSibling){
          const cuerpo=hoja.querySelector('.kw-contrato-cuerpo');
          const libre=990-(cuerpo.getBoundingClientRect().bottom-hoja.getBoundingClientRect().top);
          if(libre>0)firmas.style.marginTop=(parseFloat(getComputedStyle(firmas).marginTop)+libre)+'px';
        }
      }
      const existentes=Array.from(stack.querySelectorAll('.kw-contrato-hoja'));
      if(!existentes.length)stack.replaceChildren();
      paginas.forEach((hoja,i)=>{
        hoja.querySelector('.kw-contrato-pie').lastChild.textContent='Página '+(i+1)+' de '+paginas.length;
        if(existentes[i]){sincronizar(existentes[i].querySelector('.kw-contrato-cuerpo'),hoja.querySelector('.kw-contrato-cuerpo'));sincronizar(existentes[i].querySelector('.kw-contrato-pie'),hoja.querySelector('.kw-contrato-pie'));}else stack.appendChild(hoja);
      });
      existentes.slice(paginas.length).forEach(p=>{const padre=p.parentElement;(padre.classList.contains('page-scale-wrap')?padre:p).remove();});
      stack.querySelectorAll('.kw-contrato-hoja').forEach(hoja=>{hoja.querySelector('.kw-logo-empresa-hoja')?.remove();global.kwLogoEmpresa?.insertar(hoja);});
    }finally{medidor.remove();}
    global.fitPreviewMobile?.();
    document.dispatchEvent(new CustomEvent('kw-contrato-render',{detail:{stack:config.stack}}));
  }
  function porcion(raiz,longitud,quitar=false){
    const rango=document.createRange();rango.selectNodeContents(raiz);
    const walker=document.createTreeWalker(raiz,NodeFilter.SHOW_TEXT);let nodo,restante=longitud;
    while((nodo=walker.nextNode())){if(restante<=nodo.length){rango.setEnd(nodo,restante);break;}restante-=nodo.length;}
    const copia=raiz.cloneNode(false);copia.appendChild(quitar?rango.extractContents():rango.cloneContents());return copia;
  }
  function programar(config){clearTimeout(pendientes.get(config.stack));pendientes.set(config.stack,setTimeout(()=>render(config),120));}
  async function exportar(config,opciones={}){
    if(global.kwLogoEmpresa?.pendiente())throw new Error('Espera a que termine de guardarse el logo.');
    render(config);
    const logo=await logoParaPDF();
    const marco=document.createElement('iframe');marco.setAttribute('aria-hidden','true');marco.style.cssText='position:fixed;left:-12000px;top:0;width:816px;height:1056px;border:0;';document.body.appendChild(marco);
    try{
      const doc=marco.contentDocument;doc.documentElement.className='kw-auth-ok';
      const cargas=[];
      document.head.querySelectorAll('style,link[rel="stylesheet"]').forEach(el=>{const copia=el.cloneNode(true);if(copia.tagName==='LINK')cargas.push(new Promise(resolve=>{copia.onload=resolve;copia.onerror=resolve;}));doc.head.appendChild(copia);});
      const estilo=doc.createElement('style');estilo.textContent='html,body{margin:0!important;padding:0!important;width:816px!important;height:auto!important;overflow:visible!important;display:block!important;visibility:visible!important}.page.kw-contrato-hoja{transform:none!important;box-shadow:none!important}.kw-contrato-hoja .doc-campo:not(.filled),.kw-contrato-hoja .comercial-faltante{color:#a00015!important}';doc.head.appendChild(estilo);
      document.getElementById(config.stack).querySelectorAll('.kw-contrato-hoja').forEach(p=>{const copia=p.cloneNode(true);copia.classList.add('print-page');copia.style.transform='none';copia.querySelector('.kw-contrato-encabezado img').src=logo;doc.body.appendChild(copia);});
      await Promise.all(cargas);
      await Promise.all(Array.from(doc.images,img=>img.decode()));
      const pdf=await global.kwPDFVector.crear(doc,{top:0,left:0,right:0,bottom:0});
      const nombre=String(opciones.nombre||config.titulo).replace(/[<>:"/\\|?*]/g,'-').replace(/\.pdf$/i,'')+'.pdf';
      if(opciones.destino==='firma'){
        if(!global.kwFirmaPuente)throw new Error('No se pudo abrir el enlace con Firma digital.');
        await global.kwFirmaPuente.guardar(pdf.output('blob'),nombre,opciones.meta||{});location.assign('/hub/firmas.html?desde=documento');
      }else pdf.save(nombre);
    }finally{marco.remove();}
  }
  global.kwContratoDocumento={render,programar,exportar};
})(window);
