'use strict';
// Cloud candidate: anonymous read only, KPI/cube reconciliation, no persistent Qlik objects.
const {session}=require('./qlik-session.cjs');
const names=['1ª VARA CÍVEL','2ª VARA CÍVEL','3ª VARA CÍVEL','4ª VARA CÍVEL'];
async function readMonths(periods){
  if(!Array.isArray(periods)||periods.length<1||periods.length>24||periods.some(p=>!/^\d{4}-(0[1-9]|1[0-2])$/.test(p))||new Set(periods).size!==periods.length)throw Error('MONTHLY_INVALID_PERIODS');
  return session(async({doc,call,layout,select})=>{
    const cube=(await call(doc,'CreateSessionObject',[{qInfo:{qType:'MonthlyDistribution'},qHyperCubeDef:{qDimensions:[{qDef:{qFieldDefs:['Mês da Meta']}}],qMeasures:[{qLibraryId:'ddb6c82c-1951-4958-9d2a-06a382c9dad7'}],qSuppressZero:false,qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:12,qWidth:2}]}}])).qReturn.qHandle;
    const selections=(await call(doc,'CreateSessionObject',[{qInfo:{qType:'CurrentSelections'},qSelectionObjectDef:{}}])).qReturn.qHandle;
    const number=async()=>{const v=(await layout('YsWCP')).qHyperCube.qDataPages[0].qMatrix[0][0].qNum;if(!Number.isSafeInteger(v)||v<0)throw Error('MONTHLY_INVALID_COUNT');return v;};
    let stamp=null;
    const timestamp=async()=>{const c=(await layout('Qterjx')).qHyperCube;if(c.qMeasureInfo[0].qFallbackTitle!=='Última Atualização')throw Error('MONTHLY_INVALID_STAMP');const text=c.qDataPages[0].qMatrix[0][0].qText;if(stamp!==null&&stamp!==text)throw Error('MONTHLY_SOURCE_CHANGED');stamp=text;};
    const result=periods.map(period=>({period,counts:[null,null,null,null]}));
    for(const year of [...new Set(periods.map(p=>Number(p.slice(0,4))))])for(let unit=0;unit<4;unit++){
      await call(doc,'ClearAll');await select('Ano da Meta',year);await select('Nome completo da Unidade Judicial',names[unit]);await timestamp();
      const annual=await number(),matrix=(await call(cube,'GetLayout')).qLayout.qHyperCube.qDataPages.flatMap(p=>p.qMatrix);
      const rows=matrix.map(r=>({month:r[0].qNum,count:r[1].qNum}));
      if(rows.some(r=>!Number.isInteger(r.month)||r.month<1||r.month>12||!Number.isSafeInteger(r.count)||r.count<0)||new Set(rows.map(r=>r.month)).size!==rows.length||rows.reduce((a,r)=>a+r.count,0)!==annual)throw Error('MONTHLY_ANNUAL_MISMATCH');
      for(const output of result.filter(r=>r.period.startsWith(String(year)))){
        const month=Number(output.period.slice(5));await select('Mês da Meta',month);
        const current=(await call(selections,'GetLayout')).qLayout.qSelectionObject.qSelections;
        const yr=current.find(s=>s.qField==='Ano da Meta'),un=current.find(s=>s.qField==='Nome completo da Unidade Judicial'),mo=current.find(s=>s.qField==='Mês da Meta');
        if(yr?.qSelected!==String(year)||yr.qSelectedCount!==1||un?.qSelected!==names[unit]||un.qSelectedCount!==1||mo?.qSelectedCount!==1)throw Error('MONTHLY_FILTER_CONTEXT');
        const v=await number();if(v!==rows.find(r=>r.month===month)?.count)throw Error('MONTHLY_CUBE_FILTER_MISMATCH');output.counts[unit]=v;await timestamp();
      }
    }
    return {sourceUpdatedAt:stamp,months:result};
  });
}
if(require.main===module)readMonths(JSON.parse(process.argv[2])).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('MONTHLY_READ_FAILED');process.exitCode=1});
module.exports={readMonths};
