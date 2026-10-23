(function () {
  'use strict';
  var css = document.createElement('style');
  css.textContent = `
.kw-doc-dialog{border:1px solid #ded8d3;border-radius:14px;padding:24px;background:#fff;color:#332c29;box-sizing:border-box;font-family:inherit;font-size:13px}
.kw-doc-dialog::backdrop{background:rgba(0,0,0,.45)}
.kw-doc-dialog .kw-doc-control,.kw-doc-dialog input{font:inherit;min-height:36px;border:1px solid #ded8d3;border-radius:8px;padding:8px 12px;background:#fff;color:inherit;box-sizing:border-box}
.kw-doc-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;align-items:center;gap:12px;margin:0}
.kw-doc-dialog h2{font-size:18px;margin:0;flex:1}.kw-doc-toolbar .kw-select{width:210px;flex:0 1 210px}.kw-doc-control{display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}.kw-doc-control svg{width:16px;height:16px}.kw-doc-dialog .kw-doc-close{width:36px;padding:0;flex:0 0 36px}.kw-doc-error{grid-column:1 / -1;color:#8a1212}
.kw-doc-dialog .kw-doc-primary{background:#800020;color:#fff;border-color:#800020}
.kw-doc-viewer{position:fixed;inset:24px;margin:0;width:calc(100vw - 48px);height:calc(100dvh - 48px);max-width:none;max-height:none}
.kw-doc-viewer[open]{display:flex;flex-direction:column;gap:16px}
.kw-doc-viewer .kw-doc-toolbar{flex:0 0 auto}
.kw-doc-pages{flex:1;min-height:0;overflow:auto;background:#eee;padding:12px;box-sizing:border-box}
.kw-doc-pages canvas{display:block;max-width:100%;height:auto;margin:0 auto 12px;background:#fff}
.kw-doc-menu{position:fixed;inset:auto;margin:0;padding:6px;width:292px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);overflow:auto;z-index:11050;box-shadow:0 8px 28px rgba(0,0,0,.14)}
.kw-doc-menu>button{display:flex;align-items:center;width:100%;min-height:36px;padding:8px 12px;font-size:13px;text-align:left;border:0;line-height:1.4;white-space:normal;background:#fff;color:inherit;font-family:inherit;font-weight:400;border-radius:8px;cursor:pointer}
.kw-doc-menu>button:hover,.kw-doc-menu>button:focus-visible{background:#f5efef}
.kw-doc-menu>button:nth-of-type(4),.kw-doc-menu>button:nth-of-type(5){border-top:1px solid #eee;margin-top:4px;padding-top:10px;border-radius:0 0 8px 8px}
.kw-doc-email{display:flex;gap:8px;margin:10px 4px 4px;padding-top:12px;border-top:1px solid #eee}
.kw-doc-email input{min-width:0;width:100%;flex:1}
.kw-doc-email button{flex:0 0 auto}.kw-doc-email .kw-doc-control{border-radius:10px;padding:8px 14px;font-weight:600;line-height:18px}.kw-doc-email input{border-radius:10px}
@media(max-width:600px){.kw-doc-dialog{padding:16px}.kw-doc-dialog .kw-doc-control{min-height:40px}.kw-doc-viewer{inset:16px;width:calc(100vw - 32px);height:calc(100dvh - 32px)}.kw-doc-toolbar{grid-template-columns:minmax(0,1fr) auto}.kw-doc-toolbar h2{grid-column:1;grid-row:1}.kw-doc-toolbar .kw-select{grid-column:1;grid-row:2;width:100%}.kw-doc-toolbar .kw-doc-download{grid-column:2;grid-row:2}.kw-doc-toolbar .kw-doc-close{grid-column:2;grid-row:1;justify-self:end}.kw-doc-menu{padding:8px}}
`;

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
    var d=dialog('kw-doc-viewer');d.innerHTML='<div class="kw-doc-toolbar"><h2></h2><select aria-label="Versión del PDF"></select><button type="button" class="kw-doc-control kw-doc-download"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/></svg>Descargar</button><button type="button" class="kw-doc-control kw-doc-close" aria-label="Cerrar visor"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button><span class="kw-doc-error" role="status" hidden></span></div><div class="kw-doc-pages" tabindex="0" aria-label="Páginas del documento"></div>';
    d.querySelector('h2').textContent=options.title||'Documento';d.setAttribute('aria-label',options.title||'Documento');
    var select=d.querySelector('select'), pages=d.querySelector('.kw-doc-pages'), generation=0, task=null, blobs=new Map();
    function loadBlob(index){if(!blobs.has(index)){blobs.set(index,Promise.resolve().then(function(){return options.load(index);}).catch(function(error){blobs.delete(index);throw error;}));}return blobs.get(index);}
    (options.variants||['Documento']).forEach(function(label,index){var o=document.createElement('option');o.textContent=label;o.value=index;select.appendChild(o);});
    select.selectedIndex=Math.min(select.options.length-1,Math.max(0,options.initialIndex||0));
    select.hidden=select.options.length<2;
    d.querySelector('.kw-doc-close').onclick=function(){d.close();};
    d.querySelector('.kw-doc-download').onclick=async function(){
      var button=this,index=Number(select.value),errorMessage=d.querySelector('.kw-doc-error');button.disabled=true;errorMessage.hidden=true;
      try{var blob=await loadBlob(index),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=options.filename?options.filename(index):'documento.pdf';d.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},4000);}
      catch(error){errorMessage.textContent='No se pudo descargar el PDF. Intenta nuevamente.';errorMessage.hidden=false;}
      finally{button.disabled=false;}
    };
    d.onclose=function(){generation++;if(task)task.destroy();d.remove();if(options.onClose)options.onClose();};
    async function render(){
      var current=++generation;if(task){task.destroy();task=null;}pages.innerHTML='<div class="kw-loader" role="status" aria-label="Cargando documento"><div class="circle uno"></div><div class="circle dos"></div><div class="circle tres"></div></div>';
      try{
        var results=await Promise.all([libs(),loadBlob(Number(select.value))]);
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
    select.onchange=render;d.showModal();if(window.kwUI&&select.options.length>1)window.kwUI.selects(d);render();
  }
  function recipient(anchor) {
    return new Promise(function(resolve){
      var d=dialog('kw-doc-menu'),result=null;d.setAttribute('aria-label','Enviar por correo');
      [['asesor','Enviar al asesor'],['mca','Enviar a MCA'],['mcaa','Enviar a MCA Assistant'],['todos','Enviar a los 3'],['yo','Enviármelo a mi correo'],['otro','Enviar a otro correo']].forEach(function(item){
        var b=document.createElement('button');b.type='button';b.textContent=item[1];d.appendChild(b);
        b.onclick=function(){if(item[0]!=='otro'){result={destinatario:item[0]};d.close();return;}
          if(d.querySelector('form')){d.querySelector('input').focus();return;}
          var form=document.createElement('form');form.className='kw-doc-email';form.innerHTML='<input type="email" required maxlength="254" aria-label="Otro correo" placeholder="Correo electrónico"><button class="kw-doc-control kw-doc-primary btn-modal-confirmar" type="submit">Enviar</button>';d.appendChild(form);
          form.onsubmit=function(e){e.preventDefault();var input=form.querySelector('input');input.value=input.value.trim();if(!form.reportValidity())return;result={destinatario:'otro',correo:input.value};d.close();};form.querySelector('input').focus();
        };
      });
      function position(){var r=anchor.getBoundingClientRect(),gap=8,edge=16;var below=innerHeight-r.bottom-gap,above=r.top-gap;var top=below>=d.offsetHeight||below>=above?r.bottom+gap:r.top-gap-d.offsetHeight;d.style.left=Math.max(edge,Math.min(r.right-d.offsetWidth,innerWidth-d.offsetWidth-edge))+'px';d.style.top=Math.max(edge,Math.min(top,innerHeight-d.offsetHeight-edge))+'px';}
      var observer=new ResizeObserver(position);observer.observe(d);window.addEventListener('resize',position);
      function outside(event){if(!d.contains(event.target))d.close();}
      function keydown(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();d.close();anchor.focus({preventScroll:true});}}
      document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keydown,true);
      window.addEventListener('scroll',position,true);anchor.setAttribute('aria-expanded','true');
      d.onclose=function(){observer.disconnect();window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keydown,true);anchor.setAttribute('aria-expanded','false');d.remove();resolve(result);};d.show();position();d.querySelector('button').focus({preventScroll:true});
    });
  }
  window.kwDocumentViewer={open:open,recipient:recipient};
})();
