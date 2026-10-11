'use strict';
const {spawn}=require('node:child_process');
const path=require('node:path');
const domain=require('./domain.cjs');
function failure(code) { return Object.assign(new Error(code),{code}); }
async function deadline(operation,ms) {
  const controller=new AbortController();
  let timer;
  const timeout=new Promise((resolve,reject)=>{timer=setTimeout(()=>{
    const error=failure('META1_TIMEOUT'); controller.abort(error);reject(error);
  },ms);});
  try {return await Promise.race([Promise.resolve().then(()=>operation(controller.signal)),timeout]);}
  finally {clearTimeout(timer);}
}
function collectProcess(signal,config) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.resolve(__dirname,'./probe.cjs')],
      {stdio:['ignore','pipe','pipe'],env:{...process.env,PROBE_TIMEOUT_MS:String(config.callTimeoutMs)}});
    let stdout='',stderr='',settled=false;
    function finish(error,data) { if(settled)return;settled=true;signal.removeEventListener('abort',abort);error?reject(error):resolve(data); }
    function abort() {child.kill('SIGKILL');finish(signal.reason||failure('META1_TIMEOUT'));}
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
    child.stdout.on('data',chunk=>{stdout+=chunk;if(Buffer.byteLength(stdout)>262144){child.kill('SIGKILL');finish(failure('META1_RESPONSE_TOO_LARGE'));}});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4096);});
    child.on('error',()=>finish(failure('META1_PROCESS_FAILED')));
    child.on('close',code=>{
      if(code!==0){
        const retryable=/timeout|connection|HTTP (429|5\d\d)/i.test(stderr);
        finish(failure(retryable?'META1_TRANSPORT':'META1_INVALID_SOURCE'));return;
      }
      try {finish(null,JSON.parse(stdout));}catch(error){finish(failure('META1_INVALID_SOURCE'));}
    });
  });
}
async function runCollection({config,collect,publish,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  if(!Number.isInteger(config.collectionAttempts)||config.collectionAttempts<1||config.collectionAttempts>2 ||
     !(config.attemptTimeoutMs>0&&config.attemptTimeoutMs<=240000)||
     !(config.callTimeoutMs>0&&config.callTimeoutMs<=45000)||
     !(config.publicationTimeoutMs>0&&config.publicationTimeoutMs<=60000)||
     !(config.retryDelayMs>=0&&config.retryDelayMs<=10000)||typeof config.publishEnabled!=='boolean') throw failure('META1_INVALID_CONFIG');
  collect=collect||((signal)=>collectProcess(signal,config));
  let snapshot;
  for(let attempt=1;attempt<=config.collectionAttempts;attempt++) {
    try {
      const raw=await deadline(collect,config.attemptTimeoutMs);
      const stamps=raw.results?.map(unit=>unit.indicators?.find(item=>item.label==='Última Atualização')?.text);
      if(stamps?.length===4&&stamps.every(Boolean)&&new Set(stamps).size>1) throw failure('META1_SOURCE_CHANGED');
      snapshot=domain.normalizeProbe(raw);break;
    } catch(error) {
      if(attempt===config.collectionAttempts||!['META1_TIMEOUT','META1_TRANSPORT','META1_SOURCE_CHANGED'].includes(error.code)) throw error;
      await sleep(config.retryDelayMs);
    }
  }
  if(!config.publishEnabled) return {status:'dry-run',snapshot};
  if(typeof publish!=='function')throw failure('META1_PUBLISHER_MISSING');
  // Publishing is outside the collection retry loop: never replay a write after an ambiguous response.
  const result=await deadline(signal=>publish(snapshot,signal),config.publicationTimeoutMs);
  return {status:result.status,snapshot};
}
module.exports={runCollection,deadline,failure};

