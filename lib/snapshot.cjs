'use strict';
const fs=require('node:fs');
const path=require('node:path');
const domain=require('./domain.cjs');
function publicSnapshot(input) {
  domain.validateSnapshot(input);
  // Explicit allowlist: never propagate incidental fields from the source.
  return {schemaVersion:1,year:input.year,collectedAt:input.collectedAt,
    sourceUpdatedAt:input.sourceUpdatedAt,sourceUrl:input.sourceUrl,
    units:input.units.map(u=>({name:u.name,distributed:u.distributed,entries:u.entries,
      exits:u.exits,judged:u.judged,fulfillment:u.fulfillment,necessary:u.necessary,
      monthly:u.monthly.map(m=>({period:m.period,fulfillment:m.fulfillment}))}))};
}
function sourceTime(text){const [date,time]=text.split(' ');return date.split('/').reverse().join('-')+'T'+time;}
function saveSnapshot(input,file) {
  const snapshot=publicSnapshot(input);
  if(fs.existsSync(file)){
    const previous=publicSnapshot(JSON.parse(fs.readFileSync(file,'utf8')));
    if(snapshot.collectedAt<=previous.collectedAt || snapshot.year<previous.year ||
      (snapshot.year===previous.year&&sourceTime(snapshot.sourceUpdatedAt)<sourceTime(previous.sourceUpdatedAt)))
      throw new Error('META1_SOURCE_REGRESSION');
  }
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temporary=file+'.tmp';
  try{fs.writeFileSync(temporary,JSON.stringify(snapshot,null,2)+'\n');fs.renameSync(temporary,file);}
  finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  return snapshot;
}
module.exports={publicSnapshot,saveSnapshot};
