(function(global){
  'use strict';
  const trabajos=new WeakMap();
  function esPDF(archivo){return /\.pdf$/i.test(archivo.name)||archivo.type==='application/pdf';}
  function leer(archivo){
    return new Promise((resolve,reject)=>{
      const lector=new FileReader();
      const tiempo=setTimeout(()=>lector.abort(),45000);
      function terminar(error){clearTimeout(tiempo);if(error)reject(error);else resolve(new Uint8Array(lector.result));}
      lector.onload=()=>terminar();
      lector.onerror=()=>terminar(new Error('No se pudo leer el archivo. Vuelve a seleccionarlo desde Archivos.'));
      lector.onabort=()=>terminar(new Error('El archivo no terminó de descargarse. Guárdalo en el celular y vuelve a seleccionarlo.'));
      lector.readAsArrayBuffer(archivo);
    });
  }
  function liberar(contenedor){
    const trabajo=contenedor&&trabajos.get(contenedor);
    if(!trabajo)return;
    trabajo.cancelado=true;trabajo.observador?.disconnect();
    trabajo.tarea?.cancel();
    Promise.resolve(trabajo.pdf?.destroy()).catch(()=>{});
    trabajos.delete(contenedor);
  }
  async function dibujar(bytes,contenedor,marco){
    liberar(contenedor);
    const trabajo={cancelado:false};trabajos.set(contenedor,trabajo);
    const pdf=await global.pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;
    trabajo.pdf=pdf;
    if(trabajo.cancelado){await pdf.destroy();return [];}
    contenedor.replaceChildren();
    const estilo=getComputedStyle(marco);
    const ancho=Math.max(200,Math.min(marco.clientWidth-parseFloat(estilo.paddingLeft)-parseFloat(estilo.paddingRight)||560,900));
    const hojas=[];
    for(let n=1;n<=pdf.numPages;n++){
      if(trabajo.cancelado)return [];
      const pagina=await pdf.getPage(n),natural=pagina.getViewport({scale:1}),vista=pagina.getViewport({scale:ancho/natural.width});
      const caja=document.createElement('div');caja.className='pagina-caja';caja.style.width=vista.width+'px';
      const lienzo=document.createElement('canvas');lienzo.width=1;lienzo.height=1;lienzo.style.aspectRatio=natural.width+'/'+natural.height;
      const capa=document.createElement('div');capa.className='pagina-capa';capa.dataset.pagina=String(n);caja.append(lienzo,capa);
      const numero=document.createElement('div');numero.className='pagina-num';numero.textContent='Página '+n+' de '+pdf.numPages;
      contenedor.append(caja,numero);
      hojas.push({numero:n,caja,capa,lienzo,anchoBase:vista.width,anchoPt:natural.width,altoPt:natural.height,pagina,vista});
      if(n%4===0)await new Promise(r=>setTimeout(r,0));
    }
    async function pintar(hoja){
      if(trabajo.cancelado||hoja.dibujada||!contenedor.isConnected)return;
      const escala=Math.min(global.devicePixelRatio||1,1.5);
      hoja.lienzo.width=Math.ceil(hoja.vista.width*escala);hoja.lienzo.height=Math.ceil(hoja.vista.height*escala);
      trabajo.tarea=hoja.pagina.render({canvasContext:hoja.lienzo.getContext('2d'),viewport:hoja.vista,transform:[escala,0,0,escala,0,0]});
      await trabajo.tarea.promise;hoja.dibujada=true;hoja.pagina.cleanup();
      hoja.lienzo.dispatchEvent(new Event('kw-pdf-dibujada'));
      await new Promise(r=>setTimeout(r,0));
    }
    if(hojas.length)await pintar(hojas[0]);
    let cola=Promise.resolve();
    const pendiente=new Set();
    function encolar(hoja){
      if(pendiente.has(hoja)||hoja.dibujada)return;
      pendiente.add(hoja);
      cola=cola.then(()=>pintar(hoja)).catch(error=>{
        if(trabajo.cancelado)return;
        hoja.caja.dataset.errorPdf='';hoja.caja.setAttribute('aria-label','No se pudo dibujar esta página');
        console.warn('No se pudo dibujar una página del PDF.',error);
      }).finally(()=>pendiente.delete(hoja));
    }
    if(global.IntersectionObserver){
      trabajo.observador=new IntersectionObserver(entradas=>entradas.forEach(entrada=>{
        if(entrada.isIntersecting){const hoja=hojas.find(h=>h.caja===entrada.target);if(hoja)encolar(hoja);}
      }),{root:['auto','scroll'].includes(estilo.overflowY)?marco:null,rootMargin:'250px'});
      hojas.slice(1).forEach(h=>trabajo.observador.observe(h.caja));
    }else hojas.slice(1).forEach(encolar);
    return hojas;
  }
  global.kwFirmasArchivos={esPDF,leer,dibujar,liberar};
})(window);
