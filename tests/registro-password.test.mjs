import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function preparar(pagina, error, { mfaError=false, session=true }={}) {
  const html=readFileSync(new URL('../'+pagina,import.meta.url),'utf8');
  const form=pagina==='completar-registro.html'?'completar-form':'reset-form';
  const start=html.indexOf(`  document.getElementById('${form}').addEventListener('submit'`);
  const end=html.indexOf(pagina==='completar-registro.html'?"  document.getElementById('codigo-seguridad').addEventListener":'  init();',start);
  const campos=new Map(),mensajes=[],llamadas=[];
  let submit;
  for(const [id,value]of Object.entries({nombre:'Ana',apellido:'Prueba',password:'ClavePermitida123!',password2:'ClavePermitida123!','correo-seguridad':'ana@example.com'}))campos.set(id,{value,style:{}});
  campos.set('submit-btn',{disabled:false,style:{}});
  campos.set('paso-codigo',{style:{}});
  campos.set(form,{addEventListener(event,handler){submit=handler;}});
  const contexto=vm.createContext({
    document:{getElementById(id){return campos.get(id)||{style:{}};},querySelectorAll(){return[];}},
    window:{kwSecurity:{validPassword:value=>value.length>=12,focusOtpInput(){}}},
    sb:{auth:{getSession:async()=>({data:{session:session?{user:{id:'invitado'}}:null}}),
      updateUser:async()=>{llamadas.push('password');return{error};},signOut:async()=>{llamadas.push('signout');}}},
    llamarMFA:async()=>{llamadas.push('mfa');if(mfaError)throw Error('No se pudo enviar el código');return{enviado_a:'ana@example.com'};},
    clearMsg(){},showMsg(text,kind){mensajes.push({text,kind});},mensajeError:e=>e.message,
    registroPendiente:null,localStorage:{removeItem(){}},setTimeout(){},location:{replace(){}},BASE_PATH:'',
  });
  vm.runInContext(html.slice(start,end),contexto);
  return{contexto,campos,mensajes,llamadas,submit:()=>submit({preventDefault(){}})};
}

test('registro: la misma contraseña continúa a verificar el correo y no omite MFA',async()=>{
  const p=preparar('completar-registro.html',{code:'same_password',message:'Same password'});
  await p.submit();
  assert.deepEqual(p.llamadas,['password','mfa']);
  assert.equal(p.contexto.registroPendiente.userId,'invitado');
  assert.equal(p.campos.get('paso-codigo').style.display,'block');
  assert.equal(p.mensajes.at(-1).kind,'ok');
});

test('registro: otros errores y sesiones expiradas siguen bloqueando el registro',async()=>{
  for(const error of [{code:'weak_password',message:'Débil'},{code:'session_not_found',message:'Sin sesión'}]){
    const p=preparar('completar-registro.html',error);await p.submit();
    assert.deepEqual(p.llamadas,['password']);assert.equal(p.mensajes.at(-1).kind,'error');
    assert.equal(p.campos.get('submit-btn').disabled,false);
  }
  const p=preparar('completar-registro.html',null,{session:false});await p.submit();
  assert.deepEqual(p.llamadas,[]);assert.equal(p.mensajes.at(-1).kind,'error');
});

test('registro: un fallo del código se puede reintentar usando la contraseña ya guardada',async()=>{
  const p=preparar('completar-registro.html',{code:'same_password'},{mfaError:true});
  await p.submit();assert.deepEqual(p.llamadas,['password','mfa']);
  assert.equal(p.campos.get('submit-btn').disabled,false);
  assert.equal(p.contexto.registroPendiente,null);
});

test('recuperación: permite conservar la contraseña actual pero no ignora otros errores',async()=>{
  const p=preparar('restablecer-password.html',{code:'same_password'});await p.submit();
  assert.deepEqual(p.llamadas,['password','signout']);assert.equal(p.mensajes.at(-1).kind,'ok');
  const q=preparar('restablecer-password.html',{code:'weak_password',message:'Débil'});await q.submit();
  assert.deepEqual(q.llamadas,['password']);assert.equal(q.mensajes.at(-1).kind,'error');
});
