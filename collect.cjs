'use strict';
const path=require('node:path');
const {runCollection}=require('./lib/collector.cjs');
const {saveSnapshot}=require('./lib/snapshot.cjs');
const config={collectionAttempts:2,callTimeoutMs:45000,attemptTimeoutMs:240000,
  retryDelayMs:10000,publicationTimeoutMs:60000,publishEnabled:false};
async function main(){
  const started=Date.now();
  const result=await runCollection({config});
  const snapshot=saveSnapshot(result.snapshot,path.join(__dirname,'data/latest.json'));
  console.log(JSON.stringify({status:'validated',units:snapshot.units.length,year:snapshot.year,
    collectedAt:snapshot.collectedAt,sourceUpdatedAt:snapshot.sourceUpdatedAt,durationMs:Date.now()-started}));
}
main().catch(error=>{console.error(/^META1_[A-Z_]+$/.test(error.code||error.message)?(error.code||error.message):'META1_COLLECTION_FAILED');process.exitCode=1;});
