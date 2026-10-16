(function(global){
  'use strict';
  global.kwRecortarLogo=async function(archivo){
    if(!['image/png','image/jpeg','image/webp'].includes(archivo.type)||archivo.size>5*1024*1024)throw new Error('Elige una imagen PNG, JPG o WebP de hasta 5 MB.');
    const url=URL.createObjectURL(archivo),img=new Image();
    try{img.src=url;await img.decode();}finally{URL.revokeObjectURL(url);}
    if(!img.naturalWidth||img.naturalWidth*img.naturalHeight>40000000)throw new Error('La imagen es demasiado grande.');
    return new Promise(resolve=>{
      const anterior=document.activeElement,desborde=document.body.style.overflow,modal=document.createElement('div');
      document.body.style.overflow='hidden';
      modal.className='modal-overlay kw-logo-recorte';
      modal.innerHTML='<section class="modal-box" role="dialog" aria-modal="true" aria-labelledby="kw-recorte-titulo"><h2 id="kw-recorte-titulo">Recortar logo</h2><div class="kw-recorte-area"><canvas tabindex="0" aria-label="Área de recorte. Arrastra las esquinas para ajustar y el centro para mover. Usa las flechas para mover o Mayúsculas y flechas para ajustar el tamaño."></canvas></div><div class="kw-recorte-vista"><img alt="Vista previa del logo recortado"></div><div class="modal-actions"><button type="button" data-restablecer>Restablecer</button><button type="button" data-cancelar>Cancelar</button><button type="button" class="btn-modal-confirmar">Guardar</button></div></section>';
      document.body.appendChild(modal);
      const canvas=modal.querySelector('canvas'),ctx=canvas.getContext('2d'),preview=modal.querySelector('img');
      const escala=Math.min(560/img.naturalWidth,320/img.naturalHeight);
      canvas.width=Math.max(1,Math.round(img.naturalWidth*escala));canvas.height=Math.max(1,Math.round(img.naturalHeight*escala));
      let rect={x:0,y:0,w:canvas.width,h:canvas.height},inicio=null;
      function png(){
        const salida=document.createElement('canvas');salida.width=294;salida.height=114;
        const sx=img.naturalWidth/canvas.width,sy=img.naturalHeight/canvas.height;
        const w=rect.w*sx,h=rect.h*sy,k=Math.min(294/w,114/h);
        salida.getContext('2d').drawImage(img,rect.x*sx,rect.y*sy,w,h,(294-w*k)/2,(114-h*k)/2,w*k,h*k);
        return salida.toDataURL('image/png');
      }
      function dibujar(){
        ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
        ctx.fillStyle='rgba(0,0,0,.55)';ctx.beginPath();ctx.rect(0,0,canvas.width,canvas.height);ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.fill('evenodd');
        ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(rect.x+1,rect.y+1,Math.max(0,rect.w-2),Math.max(0,rect.h-2));
        for(const [x,y] of [[rect.x,rect.y],[rect.x+rect.w,rect.y],[rect.x,rect.y+rect.h],[rect.x+rect.w,rect.y+rect.h]]){ctx.fillStyle='#8a0000';ctx.fillRect(x-6,y-6,12,12);ctx.strokeRect(x-6,y-6,12,12);}
        preview.src=png();
      }
      const punto=e=>{const b=canvas.getBoundingClientRect();return {x:(e.clientX-b.left)*canvas.width/b.width,y:(e.clientY-b.top)*canvas.height/b.height};};
      canvas.onpointerdown=e=>{
        const p=punto(e),umbral=20*canvas.width/canvas.getBoundingClientRect().width;
        const ladoX=Math.abs(p.x-rect.x)<umbral?'l':Math.abs(p.x-rect.x-rect.w)<umbral?'r':'';
        const ladoY=Math.abs(p.y-rect.y)<umbral?'t':Math.abs(p.y-rect.y-rect.h)<umbral?'b':'';
        if(!ladoX&&!ladoY&&(p.x<rect.x||p.x>rect.x+rect.w||p.y<rect.y||p.y>rect.y+rect.h))return;
        inicio={p,rect:{...rect},ladoX,ladoY};canvas.setPointerCapture(e.pointerId);e.preventDefault();canvas.focus();
      };
      canvas.onpointermove=e=>{
        if(!inicio)return;const p=punto(e),dx=p.x-inicio.p.x,dy=p.y-inicio.p.y,r=inicio.rect;
        const minimo=Math.min(12,canvas.width,canvas.height);
        if(!inicio.ladoX&&!inicio.ladoY){rect.x=Math.max(0,Math.min(canvas.width-r.w,r.x+dx));rect.y=Math.max(0,Math.min(canvas.height-r.h,r.y+dy));}
        else{
          let l=r.x,t=r.y,der=r.x+r.w,b=r.y+r.h;
          if(inicio.ladoX==='l')l=Math.max(0,Math.min(der-minimo,r.x+dx));
          if(inicio.ladoX==='r')der=Math.min(canvas.width,Math.max(l+minimo,der+dx));
          if(inicio.ladoY==='t')t=Math.max(0,Math.min(b-minimo,r.y+dy));
          if(inicio.ladoY==='b')b=Math.min(canvas.height,Math.max(t+minimo,b+dy));
          rect={x:l,y:t,w:der-l,h:b-t};
        }dibujar();
      };
      canvas.onpointerup=canvas.onpointercancel=()=>{inicio=null;};
      canvas.onkeydown=e=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
        const dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;
        if(e.shiftKey){rect.w=Math.max(1,Math.min(canvas.width-rect.x,rect.w+dx));rect.h=Math.max(1,Math.min(canvas.height-rect.y,rect.h+dy));}
        else{rect.x=Math.max(0,Math.min(canvas.width-rect.w,rect.x+dx));rect.y=Math.max(0,Math.min(canvas.height-rect.h,rect.y+dy));}dibujar();
      };
      function cerrar(valor){modal.remove();document.body.style.overflow=desborde;anterior?.focus();resolve(valor);}
      modal.querySelector('[data-cancelar]').onclick=()=>cerrar(null);
      modal.querySelector('[data-restablecer]').onclick=()=>{rect={x:0,y:0,w:canvas.width,h:canvas.height};dibujar();};
      modal.querySelector('.btn-modal-confirmar').onclick=()=>cerrar(png());
      modal.onkeydown=e=>{
        if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cerrar(null);}
        if(e.key==='Tab'){const focos=[canvas,...modal.querySelectorAll('button')],i=focos.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();focos.at(-1).focus();}else if(!e.shiftKey&&i===focos.length-1){e.preventDefault();canvas.focus();}}
      };
      dibujar();canvas.focus();
    });
  };
})(window);
