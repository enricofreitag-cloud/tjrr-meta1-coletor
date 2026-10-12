'use strict';
const https=require('node:https');
const HOST='https://bi-qap.tjrr.jus.br',APP='d6681962-5bc2-435b-851a-ee88f31dca1c';
async function session(work){
  let cookie='';const timeout=45000;
  const get=resource=>new Promise((resolve,reject)=>{const req=https.get(HOST+resource,{headers:{Cookie:cookie}},res=>{if(res.headers['set-cookie'])cookie=res.headers['set-cookie'].map(v=>v.split(';')[0]).join('; ');res.resume();res.on('end',()=>resolve(res));});req.setTimeout(timeout,()=>req.destroy(Error('HTTP_TIMEOUT')));req.on('error',reject);});
  const page=await get('/single/?appid='+APP);if(page.statusCode!==200)throw Error('HTTP_'+page.statusCode);
  const csrf=await get('/qps/csrftoken');const token=csrf.headers['qlik-csrf-token'];if(!token)throw Error('CSRF_UNAVAILABLE');
  const query=new URLSearchParams({xrfkey:'abcdefghijklmnop','qlik-csrf-token':token});
  const ws=new WebSocket('wss://bi-qap.tjrr.jus.br/app/'+APP+'?'+query,{headers:{Cookie:cookie,Origin:HOST}});
  const pending=new Map();let id=0;
  ws.addEventListener('message',event=>{const reply=JSON.parse(event.data),p=pending.get(reply.id);if(!p)return;pending.delete(reply.id);clearTimeout(p.timer);reply.error?p.reject(Error(p.method+': '+JSON.stringify(reply.error))):p.resolve(reply.result);});
  const call=(handle,method,params=[])=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error(method+'_TIMEOUT'));},timeout);pending.set(n,{resolve,reject,timer,method});ws.send(JSON.stringify({jsonrpc:'2.0',id:n,handle,method,params}));});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.close();reject(Error('WS_TIMEOUT'));},timeout);ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('WS_FAILED'));},{once:true});});
  try{
    const doc=(await call(-1,'OpenDoc',[APP])).qReturn.qHandle;
    const object=async key=>(await call(doc,'GetObject',[key])).qReturn.qHandle;
    const layout=async key=>(await call(await object(key),'GetLayout')).qLayout;
    const properties=async key=>(await call(await object(key),'GetProperties')).qProp;
    const select=async(field,value)=>{const fieldHandle=(await call(doc,'GetField',[field])).qReturn.qHandle;const result=await call(fieldHandle,'SelectValues',[[typeof value==='number'?{qText:String(value),qIsNumeric:true,qNumber:value}:{qText:value}],false,false]);if(!result.qReturn)throw Error('SELECT_FAILED '+field);};
    return await work({doc,call,object,layout,properties,select});
  }finally{ws.close();for(const p of pending.values())clearTimeout(p.timer);cookie='';}
}
module.exports={session,HOST,APP};
