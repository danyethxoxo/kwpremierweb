import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../hub/admin.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('  function menuAsesorHtml'),html.indexOf('  function filaAsesorHtml'));
function setup(canEdit=true){
 const ctx=vm.createContext({URLSearchParams,encodeURIComponent,ICONO_LAPIZ:'',ICONO_BAJAR:'',ICONO_LISTO:'',
  usuariosCache:[{id:'web-user'}],puedeGestionarPagina:()=>canEdit,escapeHtml:s=>String(s).replaceAll('"','&quot;'),
  esDeBaja:g=>g.endsWith('_baja'),grupoBajaDe:g=>g.startsWith('back_office')?'back_office_baja':'asesor_baja',estatusDe:a=>a.grupo});
 vm.runInContext(code,ctx);return ctx.menuAsesorHtml;
}
test('every advisor layout has actions, including sheet rows and accounts without advisor records',()=>{
 const menu=setup();
 const active=menu({id:'a',nombre:'Ana',grupo:'back_office_activo'},{clave:'todos'});
 assert.match(active,/asesor-menu-btn/);assert.match(active,/data-baja-grupo="back_office_baja"/);
 const inactive=menu({id:'b',grupo:'asesor_baja'},{clave:'celulas'});
 assert.match(inactive,/data-baja-grupo="asesor_activo"/);
 const sheet=menu({nombre:'Pendiente',correo:'qa@example.com'},{clave:'asesor_activo'});
 assert.match(sheet,/asesor-menu-btn/);assert.match(sheet,/Completar ficha/);assert.doesNotMatch(sheet,/data-baja-asesor/);
 const user=menu({usuarioId:'web-user',nombre:'Usuario'},{clave:'todos'});
 assert.match(user,/data-menu-usuario="web-user"/);assert.doesNotMatch(user,/nuevo=1/);
 const readonly=setup(false)({usuarioId:'web-user'},{clave:'todos'});
 assert.match(readonly,/Ver perfil/);assert.doesNotMatch(readonly,/data-menu-usuario/);
});
