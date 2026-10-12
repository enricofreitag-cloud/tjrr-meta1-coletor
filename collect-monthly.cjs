'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {update}=require('./engine.cjs');
function saveArtifact(file,artifact){
  const temp=file+'.tmp';
  try{fs.writeFileSync(temp,JSON.stringify(artifact)+'\n');fs.renameSync(temp,file);}
  finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function readProcess(periods,signal){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(__dirname,'read-months.cjs'),JSON.stringify(periods)],{stdio:['ignore','pipe','pipe']});let text='',settled=false;
  function done(error,value){if(settled)return;settled=true;signal.removeEventListener('abort',abort);error?reject(error):resolve(value);}
  function abort(){child.kill('SIGKILL');done(Error('MONTHLY_TIMEOUT'));}
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
  child.stdout.on('data',v=>{text+=v;if(text.length>65536){child.kill('SIGKILL');done(Error('MONTHLY_RESPONSE_LIMIT'));}});
  child.stderr.resume();
  child.on('error',()=>done(Error('MONTHLY_PROCESS_FAILED')));
  child.on('close',code=>{if(code!==0){done(Error('MONTHLY_READ_FAILED'));return;}try{done(null,JSON.parse(text))}catch(e){done(Error('MONTHLY_INVALID_RESPONSE'))}});
});}
async function main(){
  // Only the prepared package's public data files. No Sheets or production credentials.
  const dataDir=path.join(__dirname,'data'),forecastPath=path.join(dataDir,'forecast.json');
  const series=JSON.parse(fs.readFileSync(forecastPath,'utf8')).series,latest=JSON.parse(fs.readFileSync(path.join(dataDir,'latest.json'),'utf8'));
  const status=await update({series,now:new Date().toISOString(),sourceUpdatedAt:latest.sourceUpdatedAt,read:readProcess,save:async({series,forecast})=>{
    // One canonical artifact contains both inputs and outputs. Git publishes one commit.
    saveArtifact(forecastPath,{series,forecast});
  }});console.log(JSON.stringify(status));
}
if(require.main===module)main().catch(()=>{console.error('MONTHLY_COLLECTION_FAILED_PRESERVING_LAST_PUBLICATION');process.exitCode=1});
module.exports={readProcess,saveArtifact};
