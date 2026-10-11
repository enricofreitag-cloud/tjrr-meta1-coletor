'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {publicSnapshot,saveSnapshot}=require('../lib/snapshot.cjs');
const {runCollection}=require('../lib/collector.cjs');
function fixture(){return {schemaVersion:1,year:2026,collectedAt:'2026-10-11T16:13:54.149Z',
  sourceUpdatedAt:'11/10/2026 00:09:09',sourceUrl:'https://estatistica.tjrr.jus.br/painel/meta-1',
  units:[1,2,3,4].map(n=>({name:n+'ª VARA CÍVEL',distributed:10,entries:1,exits:1,judged:5,
    fulfillment:0.5,necessary:5,monthly:[{period:'2026-10',fulfillment:0.5}]}))};}
test('remove campos incidentais, valida quatro unidades e preserva último resultado',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meta1-'));
  try{
    const input=fixture();input.extra='discard';assert.equal(publicSnapshot(input).extra,undefined);
    const file=path.join(dir,'latest.json');saveSnapshot(input,file);const prior=fs.readFileSync(file,'utf8');
    input.sourceUpdatedAt='10/10/2026 00:09:09';input.collectedAt='2026-10-11T18:00:00.000Z';
    assert.throws(()=>saveSnapshot(input,file),/META1_SOURCE_REGRESSION/);
    input.units.pop();assert.throws(()=>saveSnapshot(input,file));assert.equal(fs.readFileSync(file,'utf8'),prior);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('timeout esgota tentativas sem publicar ou alterar arquivo',async()=>{
  const config={collectionAttempts:2,callTimeoutMs:45000,attemptTimeoutMs:15,
    retryDelayMs:0,publicationTimeoutMs:60000,publishEnabled:false};
  let attempts=0;
  await assert.rejects(runCollection({config,collect:()=>{attempts++;return new Promise(()=>{});}}),{code:'META1_TIMEOUT'});
  assert.equal(attempts,2);
});
