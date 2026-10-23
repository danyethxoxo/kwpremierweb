(function () {
  'use strict';
  var css = document.createElement('style');
  css.textContent = '.kw-doc-dialog{border:1px solid #ded8d3;border-radius:14px;padding:24px;background:white;color:#332c29;max-width:calc(100vw - 32px);box-sizing:border-box}.kw-doc-dialog::backdrop{background:rgba(0,0,0,.45)}.kw-doc-dialog button,.kw-doc-dialog select,.kw-doc-dialog input{font:inherit;min-height:36px;border:1px solid #ded8d3;border-radius:6px;padding:6px 12px;background:white;color:inherit}.kw-doc-dialog header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}.kw-doc-dialog h2{font-size:18px;margin:0;flex:1}.kw-doc-dialog .kw-doc-primary{background:#800020;color:white;border-color:#800020}.kw-doc-viewer{width:1100px;height:90dvh}.kw-doc-pages{height:calc(100% - 60px);overflow:auto;background:#eee;padding:12px;box-sizing:border-box}.kw-doc-pages canvas{display:block;max-width:100%;height:auto;margin:0 auto 12px;background:white}.kw-doc-menu{position:fixed;margin:0;padding:8px;max-height:80dvh;overflow:auto}.kw-doc-menu button{display:block;text-align:left;border:0;width:100%}.kw-doc-menu button:hover{background:#f5efef}.kw-doc-email{display:flex;gap:8px;margin-top:12px}.kw-doc-email input{min-width:0;width:100%}@media(max-width:600px){.kw-doc-dialog{padding:20px}.kw-doc-dialog button{min-height:40px}.kw-doc-viewer{width:calc(100vw - 16px);max-width:none;height:94dvh}.kw-doc-pages{height:calc(100% - 108px)}}';
  document.head.appendChild(css);
  function dialog(className) {
    var d = document.createElement('dialog'); d.className = 'kw-doc-dialog ' + className;
    d.addEventListener('click', function (e) { if (e.target === d) { var r=d.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close(); } });
    document.body.appendChild(d); return d;
  }
  var library;
  function libs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!library) library = new Promise(function (resolve, reject) {
      var s=document.createElement('script');s.src='/assets/vendor/firmas/pdf-3.11.174.min.js';
      s.onload=function(){resolve(window.pdfjsLib);};s.onerror=function(){library=null;reject(new Error('No se pudo cargar el visor.'));};document.head.appendChild(s);
    });
    return library;
  }
  async function open(options) {
    var d=dialog('kw-doc-viewer');d.innerHTML='<header><h2></h2><select aria-label="Versión del PDF"></select><button type="button" aria-label="Cerrar visor">Cerrar</button></header><div class="kw-doc-pages" tabindex="0" aria-label="Páginas del documento"></div>';
    d.querySelector('h2').textContent=options.title||'Documento';d.setAttribute('aria-label',options.title||'Documento');
    var select=d.querySelector('select'), pages=d.querySelector('.kw-doc-pages'), generation=0, task=null;
    (options.variants||['Documento']).forEach(function(label,index){var o=document.createElement('option');o.textContent=label;o.value=index;select.appendChild(o);});
    select.hidden=select.options.length<2;
    d.querySelector('button').onclick=function(){d.close();};
    d.onclose=function(){generation++;if(task)task.destroy();d.remove();};
    async function render(){
      var current=++generation;if(task){task.destroy();task=null;}pages.innerHTML='<div class="kw-loader" role="status" aria-label="Cargando documento"><div class="circle uno"></div><div class="circle dos"></div><div class="circle tres"></div></div>';
      try{
        var results=await Promise.all([libs(),options.load(Number(select.value))]);
        var bytes=new Uint8Array(await results[1].arrayBuffer());if(current!==generation)return;
        results[0].GlobalWorkerOptions.workerSrc='/assets/vendor/firmas/pdf.worker-3.11.174.min.js';
        task=results[0].getDocument({data:bytes,isEvalSupported:false});var pdf=await task.promise;
        if(current!==generation)return;pages.replaceChildren();
        for(var i=1;i<=pdf.numPages;i++){
          var page=await pdf.getPage(i);if(current!==generation)return;
          var viewport=page.getViewport({scale:1.5}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;
          canvas.setAttribute('aria-label','Página '+i+' de '+pdf.numPages);pages.appendChild(canvas);
          await page.render({canvasContext:canvas.getContext('2d'),viewport:viewport}).promise;
        }
      }catch(error){if(current===generation)pages.textContent='No se pudo abrir el PDF. Intenta nuevamente.';}
    }
    select.onchange=render;d.showModal();render();
  }
  function recipient(anchor) {
    return new Promise(function(resolve){
      var d=dialog('kw-doc-menu'),result=null;d.setAttribute('aria-label','Enviar por correo');
      [['asesor','Enviar al asesor'],['mca','Enviar a MCA'],['mcaa','Enviar a MCA Assistant'],['todos','Enviar a los 3'],['yo','Enviármelo a mi correo'],['otro','Enviar a otro correo']].forEach(function(item){
        var b=document.createElement('button');b.type='button';b.textContent=item[1];d.appendChild(b);
        b.onclick=function(){if(item[0]!=='otro'){result={destinatario:item[0]};d.close();return;}
          if(d.querySelector('form')){d.querySelector('input').focus();return;}
          var form=document.createElement('form');form.className='kw-doc-email';form.innerHTML='<input type="email" required maxlength="254" aria-label="Otro correo" placeholder="Correo electrónico"><button class="kw-doc-primary" type="submit">Enviar</button>';d.appendChild(form);
          form.onsubmit=function(e){e.preventDefault();var input=form.querySelector('input');input.value=input.value.trim();if(!form.reportValidity())return;result={destinatario:'otro',correo:input.value};d.close();};form.querySelector('input').focus();
        };
      });
      function position(){var r=anchor.getBoundingClientRect();d.style.left=Math.max(8,Math.min(r.left,innerWidth-d.offsetWidth-8))+'px';d.style.top=Math.max(8,Math.min(r.bottom+4,innerHeight-d.offsetHeight-8))+'px';}
      var observer=new ResizeObserver(position);observer.observe(d);window.addEventListener('resize',position);
      d.onclose=function(){observer.disconnect();window.removeEventListener('resize',position);d.remove();resolve(result);};d.showModal();position();
    });
  }
  window.kwDocumentViewer={open:open,recipient:recipient};
})();
