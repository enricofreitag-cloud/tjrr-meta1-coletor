// Read-only feasibility probe. Does not write Sheets or modify persistent Qlik objects.
// Temporary selections belong only to the anonymous connection, closed at the end.
const https = require('node:https');
const path = require('node:path');
// Native Node 24 WebSocket (Undici supports the headers option). No Playwright or credentials.
if (typeof WebSocket === 'undefined' || Number(process.versions.node.split('.')[0]) < 24) {
  throw new Error('This read-only probe requires Node.js 24 or newer');
}
const host = 'https://bi-qap.tjrr.jus.br';
const app = 'd6681962-5bc2-435b-851a-ee88f31dca1c';
const sheetId = '7967a782-e936-4499-950d-74701406136b';
const year = Number(new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 4));
let cookie = '';
const timeoutMs=process.env.PROBE_TIMEOUT_MS===undefined?15000:Number(process.env.PROBE_TIMEOUT_MS);
if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>45000) throw new Error('Invalid probe timeout');
function get(resource) {
  return new Promise((resolve, reject) => {
    const request = https.get(host + resource, { headers: { Cookie: cookie } }, response => {
      if (response.headers['set-cookie']) {
        cookie = response.headers['set-cookie'].map(value => value.split(';')[0]).join('; ');
      }
      response.resume();
      response.on('end', () => resolve(response));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('HTTP timeout')));
    request.on('error', reject);
  });
}
async function main() {
  const page = await get('/single/?appid=' + app);
  if (page.statusCode !== 200) throw new Error('Page HTTP ' + page.statusCode);
  const csrf = await get('/qps/csrftoken');
  const token = csrf.headers['qlik-csrf-token'];
  if (csrf.statusCode !== 204 || !token) throw new Error('CSRF unavailable');
  const query = new URLSearchParams({ xrfkey: 'abcdefghijklmnop', 'qlik-csrf-token': token });
  const ws = new WebSocket('wss://bi-qap.tjrr.jus.br/app/' + app + '?' + query,
    { headers: { Cookie: cookie, Origin: host } });
  const pending = new Map();
  let nextId = 0;
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(entry.method + ': ' + JSON.stringify(message.error)));
    else entry.resolve(message.result);
  });
  const call = (handle, method, params = []) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timeout')); }, timeoutMs);
    pending.set(id, { resolve, reject, timer, method });
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, handle, method, params }));
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error('WebSocket connection timeout')); },timeoutMs);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket connection failed')); }, { once: true });
  });
  try {
    const doc = (await call(-1, 'OpenDoc', [app])).qReturn.qHandle;
    const object = async id => {
      const result = await call(doc, 'GetObject', [id]);
      if (!result.qReturn?.qHandle) throw new Error('Object unavailable: ' + id);
      return result.qReturn.qHandle;
    };
    const layout = async id => (await call(await object(id), 'GetLayout')).qLayout;
    const select = async (field, value) => {
      const handle = (await call(doc, 'GetField', [field])).qReturn.qHandle;
      const result = await call(handle, 'SelectValues', [[value], false, false]);
      if (!result.qReturn) throw new Error('Selection failed: ' + field);
    };
    await call(doc, 'ClearAll');
    await select('Ano da Meta', { qText: String(year), qIsNumeric: true, qNumber: year });
    const sheet = await layout(sheetId);
    const container = await layout('eDrja');
    const selection = (await call(doc, 'CreateSessionObject', [{ qInfo: { qType: 'CurrentSelections' }, qSelectionObjectDef: {} }])).qReturn.qHandle;
    const ids = sheet.cells.filter(cell => ['kpi', 'gauge'].includes(cell.type)).map(cell => cell.name);
    const results = [];
    for (const unit of ['1ª VARA CÍVEL', '2ª VARA CÍVEL', '3ª VARA CÍVEL', '4ª VARA CÍVEL']) {
      await select('Nome completo da Unidade Judicial', { qText: unit });
      const current = (await call(selection, 'GetLayout')).qLayout.qSelectionObject.qSelections;
      const selectedUnit = current.find(value => value.qField === 'Nome completo da Unidade Judicial');
      const selectedYear = current.find(value => value.qField === 'Ano da Meta');
      if (selectedUnit?.qSelectedCount !== 1 || selectedUnit.qSelected !== unit || selectedYear?.qSelected !== String(year)) {
        throw new Error('Unexpected filter context');
      }
      const indicators = [];
      for (const id of ids) {
        const value = await layout(id);
        const cell = value.qHyperCube?.qDataPages?.[0]?.qMatrix?.[0]?.[0];
        if (!cell || !Number.isFinite(cell.qNum)) throw new Error('Invalid indicator ' + id);
        indicators.push({ id, label: value.qHyperCube.qMeasureInfo[0].qFallbackTitle,
          value: cell.qNum, text: cell.qText });
      }
      const monthlyId = container.qChildList.qItems.find(child => child.qData.containerChildId ===
        container.children.find(child => child.label === 'Acompanhamento Mensal').refId).qInfo.qId;
      const monthlyHandle = await object(monthlyId);
      const monthly = (await call(monthlyHandle, 'GetLayout')).qLayout.qHyperCube;
      const pages = await call(monthlyHandle, 'GetHyperCubeData', ['/qHyperCubeDef',
        [{ qTop: 0, qLeft: 0, qHeight: Math.min(monthly.qSize.qcy, 100), qWidth: monthly.qSize.qcx }]]);
      results.push({ unit, indicators, monthly: {
        dimensions: monthly.qDimensionInfo.map(value => value.qFallbackTitle),
        measures: monthly.qMeasureInfo.map(value => value.qFallbackTitle),
        rows: pages.qDataPages.flatMap(page => page.qMatrix.map(row => row.map(cell => ({ text: cell.qText, value: Number.isFinite(cell.qNum) ? cell.qNum : null }))))
      }});
    }
    const output = { source: host, year, collectedAt: new Date().toISOString(), results };
    if (process.argv[2]) {
      const fs = require('node:fs');
      const root = path.resolve(__dirname, '../..');
      const destination = path.resolve(process.argv[2]);
      if (!destination.startsWith(root + path.sep)) throw new Error('Output must stay within the project');
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, JSON.stringify(output, null, 2) + '\n');
    }
    console.log(JSON.stringify(output, null, 2));
  } finally {
    ws.close();
    for (const entry of pending.values()) clearTimeout(entry.timer);
    cookie = '';
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
