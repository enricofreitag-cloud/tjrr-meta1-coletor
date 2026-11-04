'use strict';
const MEASURE = '0baa6949-956d-4202-91e3-143293b1bb5a';
const DIMENSION = 'Ano/Mês da Movimentação';
function requireSource(condition) {
  if (!condition) throw new Error('META1_SOURCE_CONTRACT');
}
async function createAccumulatedReader(call, doc) {
  // Connection-scoped cube: never change the source chart or persistent objects.
  // Sort by period before evaluating RangeSum/Above in the official measure.
  const handle = (await call(doc, 'CreateSessionObject', [{
    qInfo: {qType: 'Meta1Accumulated'},
    qHyperCubeDef: {
      qDimensions: [{qDef: {qFieldDefs: [DIMENSION], qSortCriterias: [{qSortByNumeric: 1}]}}],
      qMeasures: [{qLibraryId: MEASURE}], qInterColumnSortOrder: [0],
      qInitialDataFetch: [{qTop: 0, qLeft: 0, qWidth: 2, qHeight: 100}]
    }
  }])).qReturn.qHandle;
  return async fulfillment => {
    const cube = (await call(handle, 'GetLayout')).qLayout.qHyperCube;
    requireSource(cube && cube.qSize?.qcx === 2 && Number.isInteger(cube.qSize.qcy) &&
      cube.qSize.qcy > 0 && cube.qSize.qcy <= 100 && cube.qDimensionInfo?.length === 1 &&
      cube.qDimensionInfo[0].qFallbackTitle === DIMENSION && cube.qMeasureInfo?.length === 1 &&
      cube.qMeasureInfo[0].qLibraryId === MEASURE && cube.qMeasureInfo[0].qFallbackTitle === 'GC Acumulado');
    const data = await call(handle, 'GetHyperCubeData', ['/qHyperCubeDef',
      [{qTop: 0, qLeft: 0, qWidth: 2, qHeight: cube.qSize.qcy}]]);
    const matrix = data.qDataPages.flatMap(page => page.qMatrix);
    requireSource(matrix.length === cube.qSize.qcy);
    let previous = -Infinity;
    const rows = matrix.map(row => {
      requireSource(row.length === 2 && Number.isSafeInteger(row[0].qNum) &&
        row[0].qNum > previous && Number.isFinite(row[1].qNum));
      previous = row[0].qNum;
      return row.map(cell => ({text: cell.qText, value: cell.qNum}));
    });
    const last = rows.at(-1)[1].value;
    requireSource(Number.isFinite(fulfillment) && Math.abs(last - fulfillment) <= 1e-12 * Math.max(1, Math.abs(fulfillment)));
    return {dimensions: [DIMENSION], measures: ['GC Acumulado'], rows};
  };
}
module.exports = {createAccumulatedReader};
