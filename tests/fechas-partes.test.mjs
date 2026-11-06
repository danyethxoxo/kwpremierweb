import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../assets/js/kw-fechas-partes.js',import.meta.url),'utf8');
class Input{
 constructor(id,value=''){this.id=id;this.raw=value;this.dataset={};this.disabled=false;this.listeners={};}
 get value(){return this.raw} set value(v){this.raw=String(v)}
 closest(){return {querySelector:()=>({textContent:'Fecha de escritura'})}}
 after(caja){this.caja=caja}
 dispatchEvent(e){(this.listeners[e.type]||[]).forEach(f=>f(e))}
}
class Select{
 constructor(){this.options=[];this.selected='';this.listeners={};this.dataset={};this.disabled=false}
 add(o){this.options.push(o)}
 remove(i){this.options.splice(i,1)}
 get value(){return this.selected}
 set value(v){this.selected=this.options.some(o=>o.value===String(v))?String(v):''}
 setAttribute(){}
 addEventListener(k,f){(this.listeners[k]??=[]).push(f)}
 dispatchEvent(e){(this.listeners[e.type]||[]).forEach(f=>f(e))}
}
function setup(value=''){
 const input=new Input('f-escritura-fecha',value);
 const document={readyState:'complete',querySelectorAll:()=>[input],querySelector:()=>input.caja,
 createElement:tag=>tag==='select'?new Select():{dataset:{},children:[],appendChild(el){this.children.push(el)},querySelectorAll(){return this.children}}};
 class Option{constructor(text,value){this.textContent=text;this.value=value}}
 class Event{constructor(type){this.type=type}}
 const scope=vm.createContext({document,HTMLInputElement:Input,Option,Event,Date,window:{kwUI:{selects(){}},kwSelectBusqueda:{preparar(){}}}});
 vm.runInContext(source,scope);return{input,parts:input.caja.children,scope,Event};
}
test('reabre fechas guardadas y sincroniza ISO al cambiar día, mes y año',()=>{
 const {input,parts,Event}=setup('2020-02-29');
 assert.deepEqual(parts.map(p=>p.value),['29','02','2020']);
 parts[2].value='2021';parts[2].dispatchEvent(new Event('change'));
 assert.equal(input.value,'');assert.equal(parts[0].value,'');
 parts[0].value='28';parts[0].dispatchEvent(new Event('change'));assert.equal(input.value,'2021-02-28');
 input.value='1998-12-01';assert.deepEqual(parts.map(p=>p.value),['01','12','1998']);
 input.value='';assert.deepEqual(parts.map(p=>p.value),['','','']);
});
test('no duplica controles y respeta el bloqueo del documento finalizado',()=>{
 const {input,parts,scope}=setup('2026-11-06');
 scope.window.kwFechasPartes.fechas();assert.equal(input.caja.children.length,3);
 input.disabled=true;scope.window.kwFechasPartes.sincronizarBloqueos();assert.ok(parts.every(p=>p.disabled));
 input.disabled=false;scope.window.kwFechasPartes.sincronizarBloqueos();assert.ok(parts.every(p=>!p.disabled));
 assert.deepEqual(parts.map(p=>p.options[0].textContent),['DD','MM','AAAA']);
});
