'use strict';
// Dependency-free cloud candidate: chronological validation, seasonal OLS, block bootstrap.
function valid(v){if(!v)throw Error('MONTHLY_INVALID_DATA');}
function index(period){valid(/^\d{4}-(0[1-9]|1[0-2])$/.test(period));return (Number(period.slice(0,4))-2021)*12+Number(period.slice(5))-1;}
function period(t){return (2021+Math.floor(t/12))+'-'+String(t%12+1).padStart(2,'0');}
function calendar(now){const d=new Date(now);valid(Number.isFinite(d.getTime()));return new Date(d.getTime()-4*3600000).toISOString().slice(0,7);}
function sourcePeriod(stamp){
  const m=/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(stamp);valid(m);
  const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1],+m[4],+m[5],+m[6]));
  valid(d.getUTCFullYear()===+m[3]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[1]&&+m[4]<24&&+m[5]<60&&+m[6]<60);
  return m[3]+'-'+m[2];
}
function validateSeries(s){
  valid(s&&s.schemaVersion===1&&Array.isArray(s.months)&&s.months.length>=24&&s.months.length<=600);sourcePeriod(s.sourceUpdatedAt);
  s.months.forEach((m,i)=>valid(index(m.period)===i&&Array.isArray(m.counts)&&m.counts.length===4&&m.counts.every(v=>Number.isSafeInteger(v)&&v>=0)));
  valid(s.months.at(-1).period<sourcePeriod(s.sourceUpdatedAt));return s;
}
function pendingPeriods(s,now,stamp){validateSeries(s);const boundary=Math.min(index(calendar(now)),index(sourcePeriod(stamp)));return Array.from({length:Math.max(0,boundary-s.months.length)},(_,i)=>period(s.months.length+i));}
function appendMonths(s,added,now,stamp){
  const pending=pendingPeriods(s,now,stamp);valid(Array.isArray(added)&&added.length===pending.length);
  added.forEach((m,i)=>valid(m.period===pending[i]));
  valid(stamp.split(' ')[0].split('/').reverse().join('-')+'T'+stamp.split(' ')[1]>=s.sourceUpdatedAt.split(' ')[0].split('/').reverse().join('-')+'T'+s.sourceUpdatedAt.split(' ')[1]);
  return validateSeries({schemaVersion:1,sourceUpdatedAt:stamp,months:[...s.months.map(m=>({period:m.period,counts:m.counts.slice()})),...added.map(m=>({period:m.period,counts:m.counts.slice()}))]});
}
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function design(t){return [1,t,...Array.from({length:11},(_,i)=>Number(t%12===i+1))];}
function inverse(a){
  const n=a.length,m=a.map((r,i)=>[...r,...Array.from({length:n},(_,j)=>Number(i===j))]);
  for(let i=0;i<n;i++){
    let pivot=i;for(let j=i+1;j<n;j++)if(Math.abs(m[j][i])>Math.abs(m[pivot][i]))pivot=j;
    valid(Math.abs(m[pivot][i])>1e-10);[m[i],m[pivot]]=[m[pivot],m[i]];
    const q=m[i][i];m[i]=m[i].map(v=>v/q);
    for(let j=0;j<n;j++)if(j!==i){const qj=m[j][i];m[j]=m[j].map((v,k)=>v-qj*m[i][k]);}
  }return m.map(r=>r.slice(n));
}
function rng(seed){let state=seed>>>0;return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};}
function block(e,n,random){const out=[];while(out.length<n){const start=Math.floor(random()*e.length);for(let j=0;j<6&&out.length<n;j++)out.push(e[(start+j)%e.length]);}return out;}
function quantile(values,q){values.sort((a,b)=>a-b);const p=(values.length-1)*q,i=Math.floor(p);return values[i]+(values[Math.min(i+1,values.length-1)]-values[i])*(p-i);}
function project(series,now,{simulations=5000}={}){
  validateSeries(series);valid(Number.isInteger(simulations)&&simulations>=100&&simulations<=5000);
  const n=series.months.length;valid(series.months.at(-1).period<calendar(now));
  const X=Array.from({length:n},(_,t)=>design(t)),F=Array.from({length:36},(_,i)=>design(n+i));
  const xtx=Array.from({length:13},(_,i)=>Array.from({length:13},(_,j)=>X.reduce((s,r)=>s+r[i]*r[j],0)));
  const inv=inverse(xtx),pinv=inv.map(r=>X.map(x=>dot(r,x)));
  const firstYear=Number(calendar(now).slice(0,4));
  const units=Array.from({length:4},(_,unit)=>{
    const values=series.months.map(m=>m.counts[unit]),beta=pinv.map(r=>dot(r,values));
    const fit=X.map(x=>dot(x,beta)),raw=values.map((v,i)=>v-fit[i]),mean=raw.reduce((a,b)=>a+b,0)/n;
    const residuals=raw.map(v=>(v-mean)*Math.sqrt(n/(n-13))),random=rng(20261012+unit);
    const central=F.map(x=>Math.max(0,dot(x,beta))),draws=Array.from({length:36},()=>[]),annualDraws=Array.from({length:3},()=>[]);
    const known=Array.from({length:3},(_,i)=>series.months.filter(m=>m.period.startsWith(String(firstYear+i))).reduce((sum,m)=>sum+m.counts[unit],0));
    for(let s=0;s<simulations;s++){
      const errors=block(residuals,n,random),drawBeta=beta.map((v,i)=>v+dot(pinv[i],errors)),futureErrors=block(residuals,36,random),annualPath=known.slice();
      F.forEach((x,i)=>{const v=Math.max(0,dot(x,drawBeta)+futureErrors[i]);draws[i].push(v);const year=Number(period(n+i).slice(0,4))-firstYear;if(year>=0&&year<3)annualPath[year]+=v;});
      annualPath.forEach((v,i)=>annualDraws[i].push(v));
    }
    const bands=[.025,.1,.9,.975].map(q=>draws.map(v=>quantile(v.slice(),q)));
    const tmean=(n-1)/2,ymean=values.reduce((a,b)=>a+b,0)/n,b=values.reduce((s,v,i)=>s+(i-tmean)*(v-ymean),0)/Array.from({length:n},(_,i)=>(i-tmean)**2).reduce((a,b)=>a+b,0);
    const annual=Array.from({length:3},(_,i)=>{
      const year=firstYear+i,ids=Array.from({length:36},(_,j)=>j).filter(j=>Number(period(n+j).slice(0,4))===year),observedMonths=series.months.filter(m=>m.period.startsWith(String(year))).length;
      valid(ids.length+observedMonths===12);const unrounded=known[i]+ids.reduce((sum,j)=>sum+central[j],0);
      return {year,observedMonths,projectedMonths:ids.length,observedTotal:known[i],unrounded,estimate:Math.round(unrounded),pi95Low:quantile(annualDraws[i].slice(),.025),pi95High:quantile(annualDraws[i].slice(),.975)};
    });
    return {unit,name:(unit+1)+'ª Vara Cível',observed:series.months.map((m,i)=>({period:m.period,distributed:values[i]})),linear:[ymean-b*tmean,b],central,bands,annual};
  });
  return {schemaVersion:1,modelVersion:'seasonal-ols-block6-v1',computedAt:now,sourceUpdatedAt:series.sourceUpdatedAt,trainedThrough:series.months.at(-1).period,futureFrom:period(n),futureTo:period(n+35),simulations,units};
}
async function update({series,now,sourceUpdatedAt,read,save,timeoutMs=90000}){
  const periods=pendingPeriods(series,now,sourceUpdatedAt);if(!periods.length)return {status:'UNCHANGED',trainedThrough:series.months.at(-1).period};
  let timer;const controller=new AbortController();
  try{
    const result=await Promise.race([Promise.resolve().then(()=>read(periods,controller.signal)),new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('MONTHLY_TIMEOUT'));},timeoutMs)})]);
    valid(result.sourceUpdatedAt===sourceUpdatedAt);
    const next=appendMonths(series,result.months,now,sourceUpdatedAt),forecast=project(next,now);
    await save({series:next,forecast});return {status:'UPDATED',trainedThrough:forecast.trainedThrough,monthsAdded:periods.length};
  }finally{clearTimeout(timer);controller.abort();}
}
module.exports={validateSeries,pendingPeriods,appendMonths,project,update,period,index};
