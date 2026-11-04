'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createAccumulatedReader} = require('../lib/accumulated.cjs');

// RPC is the external Qlik boundary. Chart layout deliberately supplies a monthly
// measure; consulting it would reproduce the October 27 outage.
function source(change = () => {}) {
  const cube = {
    qSize: {qcx: 2, qcy: 2},
    qDimensionInfo: [{qFallbackTitle: 'Ano/Mês da Movimentação'}],
    qMeasureInfo: [{qFallbackTitle: 'GC Acumulado', qLibraryId: '0baa6949-956d-4202-91e3-143293b1bb5a'}]
  };
  const rows = [[{qNum: 202609, qText: '2026/Set'}, {qNum: 0.6, qText: '60%'}],
    [{qNum: 202610, qText: '2026/Out'}, {qNum: 0.7, qText: '70%'}]];
  change(cube, rows);
  const call = async (handle, method, params) => {
    if (method === 'CreateSessionObject') {
      const def = params[0].qHyperCubeDef;
      assert.deepEqual(def.qMeasures, [{qLibraryId: '0baa6949-956d-4202-91e3-143293b1bb5a'}]);
      assert.deepEqual(def.qDimensions[0].qDef.qFieldDefs, ['Ano/Mês da Movimentação']);
      assert.deepEqual(def.qDimensions[0].qDef.qSortCriterias, [{qSortByNumeric: 1}]);
      assert.deepEqual(def.qInterColumnSortOrder, [0]);
      return {qReturn: {qHandle: 17}};
    }
    assert.equal(handle, 17);
    if (method === 'GetLayout') return {qLayout: {qHyperCube: cube}};
    if (method === 'GetHyperCubeData') return {qDataPages: [{qMatrix: rows}]};
    throw Error('Unexpected RPC ' + method);
  };
  return call;
}

test('reads explicit accumulated measure independently of the mutable monthly chart', async () => {
  const read = await createAccumulatedReader(source(), 1);
  assert.deepEqual(await read(0.7), {
    dimensions: ['Ano/Mês da Movimentação'], measures: ['GC Acumulado'],
    rows: [[{text: '2026/Set', value: 202609}, {text: '60%', value: 0.6}],
      [{text: '2026/Out', value: 202610}, {text: '70%', value: 0.7}]]
  });
});

test('rejects monthly substitution, wrong dimensions, truncation and reversed accumulation', async () => {
  for (const change of [
    c => c.qMeasureInfo[0].qLibraryId = 'jymBt',
    c => c.qMeasureInfo[0].qFallbackTitle = 'GC - Meta 1',
    c => c.qDimensionInfo[0].qFallbackTitle = 'Mês da Meta',
    c => c.qSize.qcy = 3,
    c => c.qSize.qcy = 101,
    (c, rows) => rows.reverse(),
    (c, rows) => rows[0][1].qNum = NaN
  ]) {
    const read = await createAccumulatedReader(source(change), 1);
    await assert.rejects(read(0.7), /META1_SOURCE_CONTRACT/);
  }
});

test('rejects accumulated series inconsistent with current KPI', async () => {
  const read = await createAccumulatedReader(source(), 1);
  await assert.rejects(read(0.8), /META1_SOURCE_CONTRACT/);
});
