import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';

function source(file){return stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/'+file,import.meta.url),'utf8').replace(/^import[^\r\n]*\r?\n/gm,'').replace(/^export /gm,''),{mode:'strip'});}
function renderer(){const scope=vm.createContext({Deno:{env:{get:()=>''}}});vm.runInContext(source('_shared/mailer.ts'),scope);return scope.plantillaCorreo;}
test('correos: contenido escapado, enlace completo y boton legible sin CSS externo',()=>{
  const render=renderer();
  const html=render({title:'<script>titulo</script>',intro:'Hola',content:'A & B',actionLabel:'Aceptar invitacion',actionUrl:'https://example.com/verify?token=x&type=invite'});
  assert.ok(!html.includes('<script>'));assert.match(html,/A &amp; B/);
  assert.match(html,/token=x&amp;type=invite/);assert.match(html,/bgcolor="#cc0000"/);assert.match(html,/color:#ffffff !important/);
  const code=render({title:'Codigo',intro:'Verifica',content:'Un solo uso',code:'123456'});
  assert.match(code,/123456/);assert.ok(!code.includes('<a href='));
});

function invitacion({role='master',rol='asociado',mailFails=false,mfaFails=false,linkFails=false}={}){
  const events=[];let handler;
  const admin={auth:{getUser:async()=>({data:{user:{id:'caller'}}}),admin:{
    generateLink:async p=>{events.push(['link',p]);return linkFails?{error:{message:'Cuenta ya registrada'}}:{data:{user:{id:'new'},properties:{action_link:'https://example.com/verify?token=x&type=invite'}}};},
    deleteUser:async()=>{events.push(['delete']);return{};},
  }},from(table){return{select(){return this;},eq(){return this;},single:async()=>({data:{role}}),
    upsert:async p=>{events.push(['mfa',p]);return mfaFails?{error:{message:'MFA failed'}}:{};},
    update(p){events.push(['role',p]);return{eq:async()=>({})};},
  };}};
  const scope=vm.createContext({Response,console,Deno:{env:{get:()=> 'configured'}},validEmail:()=>true,createClient:()=>admin,
    secureServe:(_,h)=>handler=h,plantillaCorreo:renderer(),enviarCorreo:async p=>{events.push(['mail',p]);if(mailFails)throw Error('Provider failed');},
  });vm.runInContext(source('invitar-usuario/index.ts'),scope);
  return{events,run:()=>handler(new Request('https://example.com',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({email:'test@example.com',rol})}))};
}
test('invitacion conserva verificacion, MFA y rol antes de enviar el correo',async()=>{
  const m=invitacion();assert.equal((await m.run()).status,200);
  assert.deepEqual(m.events.map(e=>e[0]),['link','mfa','role','mail']);
  assert.equal(m.events[0][1].type,'invite');assert.match(m.events[0][1].options.redirectTo,/completar-registro/);
  assert.equal(m.events[1][1].activo,false);assert.equal(m.events[2][1].role,'asociado');
  assert.match(m.events[3][1].html,/Aceptar invitaci/);assert.match(m.events[3][1].text,/token=x&type=invite/);
});
test('invitacion rechaza roles no autorizados y no envia correo tras fallos',async()=>{
  const denied=invitacion({role:'admin',rol:'admin'});assert.equal((await denied.run()).status,403);assert.equal(denied.events.length,0);
  const existing=invitacion({linkFails:true});assert.equal((await existing.run()).status,400);assert.equal(existing.events.length,1);
  const mfa=invitacion({mfaFails:true});assert.equal((await mfa.run()).status,500);assert.ok(!mfa.events.some(e=>e[0]==='mail'));
  const mail=invitacion({mailFails:true});assert.equal((await mail.run()).status,502);assert.ok(!mail.events.some(e=>e[0]==='delete'));
});
