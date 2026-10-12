import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../hub/admin.html', import.meta.url), 'utf8');
const helpers = html.slice(html.indexOf('  function correoPersona('), html.indexOf('  let personaAltaPagina'));
function context(role = 'master') {
  const ctx = vm.createContext({miRol:role,miUserId:'self',ROLE_LABELS:{master:'Master',admin:'Admin',staff:'Liderazgo',asociado:'Asociado'},
    usuariosCache:[],gruposAsesores:[],esDeBaja:g=>['asesor_baja','back_office_baja','bajas'].includes(g),escapeHtml:s=>String(s)});
  vm.runInContext(helpers,ctx);return ctx;
}
test('Todos reúne el directorio activo y los usuarios de la página por correo, excluye bajas y conserva el grupo original',()=>{
  const c=context();c.gruposAsesores=[
    {clave:'asesor_activo',personas:[{id:'a',nombre:'Ana',correo:'ANA@example.com'}]},
    {clave:'back_office_activo',personas:[{id:'b',nombre:'Beto',correo:'beto@example.com'}]},
    {clave:'asesor_baja',personas:[{id:'c',nombre:'Baja',correo:'baja@example.com'}]},
    {clave:'celulas',personas:[{nombre:'Baja',correo:'baja@example.com'}]},
  ];
  c.usuariosCache=[{id:'u1',nombre:'Ana',email:' ana@example.com ',role:'asociado'},
    {id:'u2',nombre:'Líder',email:'lider@example.com',role:'staff'},
    {id:'u3',nombre:'General',email:'general@example.com',role:'asociado',oculto:true},
    {id:'u4',nombre:'Baja',email:'baja@example.com',role:'asociado'}];
  c.actualizarGrupoTodos();c.actualizarGrupoTodos();
  const todos=c.gruposAsesores[0];assert.equal(todos.clave,'todos');assert.equal(todos.personas.length,4);
  assert.equal(todos.personas.find(p=>p.id==='a').usuarioId,'u1');
  assert.equal(todos.personas.find(p=>p.id==='b').grupo,'back_office_activo');
  assert.equal(todos.personas.find(p=>p.usuarioId==='u2').id,undefined);
  assert.ok(!todos.personas.some(p=>p.correo==='baja@example.com'));
  assert.equal(c.gruposAsesores.filter(g=>g.clave==='todos').length,1);
});
test('Acceso a la página respeta permisos, detecta cuentas existentes y no permite cambiar el propio rol',()=>{
  const c=context('admin');c.usuariosCache=[{id:'u',email:'ana@example.com',role:'staff'}];
  assert.match(c.accesoPaginaHtml({correo:'ANA@example.com'}),/Cambiar rol/);
  assert.match(c.accesoPaginaHtml({correo:'new@example.com'}),/Agregar a la página/);
  assert.equal(c.puedeGestionarPagina({id:'other',role:'admin'}),false);
  assert.equal(c.puedeGestionarPagina({id:'self',role:'staff'}),false);
  c.miRol='staff';assert.equal(c.puedeGestionarPagina(null),false);
});
