export function gridPremier(){
 const g=Array.from({length:70},()=>[]),put=(r,c,v)=>{g[r-1][c-1]=v;};
 put(5,6,'Citas de Reclutamiento');put(5,17,'Crecimiento Neto de Asociados');
 [[7,6,6],[7,9,3],[7,12,1],[7,19,'$500,000'],[7,20,'$300,000'],[7,17,-2],[22,10,80],[22,15,4],[20,15,6],[19,20,'$2,000,000'],[20,20,'$210,000']].forEach(a=>put(...a));
 for(const [r,label,v,renta]of [[30,'Unidades Cerradas (Lados)',12,18],[33,'Listados (Exclusivas)',8,4],[36,'Listados (Opciones)',0,0],[39,'Listados Cerrados',5,9],[42,'Acuerdos Firmados',10,7]]){put(r,4,label);put(r,9,v);put(r,12,renta);put(r+1,9,v===0?'':v*1000000);put(r+1,12,renta===0?'#DIV/0!':renta*20000);}
 [10,12,14].forEach(r=>Array.from({length:31},(_,i)=>put(r,27+i,i===10?'':(i*3+r)%24)));
 return g;
}
export function gridCentro(i){const g=Array.from({length:65},()=>[]),put=(r,c,v)=>{g[r-1][c-1]=v;};put(8,7,'Citas de Reclutamiento');put(8,10,'Gross');[[8,24,25+i*12],[12,7,i*5],[12,8,2],[10,10,i],[10,15,i-2],[25,10,2],[11,18,350000+i*10000],[11,19,250000],[13,18,100000+i*10000],[24,19,900000+i*110000]].forEach(a=>put(...a));return g;}
