// La llave privada y la sesion de prueba solo viven en memoria de este proceso.
import {generateKeyPairSync,privateDecrypt,constants,createDecipheriv} from 'node:crypto';
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
import {probarConcurrencia} from './probar-concurrencia.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
console.log('PUBLICKEY '+JSON.stringify(publicKey.export({format:'jwk'})));
const lines=createInterface({input:process.stdin,terminal:false});
for await(const line of lines){
 try{
  const input=JSON.parse(line);
  const key=privateDecrypt({key:privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(input.encryptedKey,'base64'));
  const ciphertext=Buffer.from(input.ciphertext,'base64');
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(input.iv,'base64'));
  decipher.setAuthTag(ciphertext.subarray(-16));
  const session=JSON.parse(Buffer.concat([decipher.update(ciphertext.subarray(0,-16)),decipher.final()]).toString('utf8'));
  key.fill(0);
  const config={api:session.api,modo:'inventario',permitirProduccion:true,niveles:[5,25,50,200],repeticionesPorNivel:1,timeoutMs:12000,p95MaxMs:10000,
   sesiones:Array.from({length:200},()=>({token:session.token})),filtros:input.filtros||[{estatus:'publicada',orden:'reciente'}]};
  const result=await probarConcurrencia(config);
  result.identidadesDePrueba=1;
  result.alcance='Búsquedas autenticadas reales desde un cliente externo; una identidad temporal, no 200 usuarios';
  try{
   const logout=await fetch(session.api+'/auth/v1/logout?scope=global',{method:'POST',headers:{apikey:session.apikey,Authorization:'Bearer '+session.token},signal:AbortSignal.timeout(10000)});
   result.sesionRevocada=logout.ok;await logout.arrayBuffer();
  }catch{result.sesionRevocada=false;}
  const escenario=input.escenario==='variada'?'variada':'repetida';
  writeFileSync(new URL('../tmp/carga-inventario-'+escenario+'.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  console.log('RESULTADO '+JSON.stringify(result));
  lines.close();process.exit(result.aprobado?0:1);
 }catch{console.error('No se pudo ejecutar el conductor de prueba');lines.close();process.exit(1);}
}
