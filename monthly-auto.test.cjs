'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {project,pendingPeriods,appendMonths,update}=require('./engine.cjs');
const artifact=require('./data/forecast.json');
const series={schemaVersion:1,sourceUpdatedAt:'12/10/2026 02:03:39',months:artifact.series.months.slice(0,69)};
test('base pública e estimativas centrais reproduzem o estudo',()=>{
  const f=project(series,'2026-10-12T12:26:39.253Z',{simulations:100});
  assert.deepEqual(f.units.map(u=>u.annual.map(a=>a.estimate)),[[2316,2529,2784],[2404,2522,2783],[2379,2522,2778],[2261,2418,2659]]);
});
test('somente meses encerrados nas quatro unidades são incorporados',()=>{
  assert.deepEqual(pendingPeriods(series,'2026-11-01T06:00:00.000Z','31/10/2026 23:59:59'),[]);
  const next=appendMonths(series,[{period:'2026-10',counts:[300,290,280,270]}],'2026-11-01T06:00:00.000Z','01/11/2026 01:00:00');
  const f=project(next,'2026-11-01T06:00:00.000Z',{simulations:100});assert.equal(f.units[0].annual[0].observedMonths,10);assert.equal(f.units[0].annual[0].estimate,2428);
});
test('timeout preserva a última publicação',async()=>{
  let saved=false;await assert.rejects(()=>update({series,now:'2026-11-01T06:00:00.000Z',sourceUpdatedAt:'01/11/2026 01:00:00',timeoutMs:10,read:()=>new Promise(()=>{}),save:()=>saved=true}),/TIMEOUT/);assert.equal(saved,false);
});
