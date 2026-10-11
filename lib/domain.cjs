'use strict';
var Meta1Domain = (function () {
  var SOURCE = 'https://estatistica.tjrr.jus.br/painel/meta-1';
  var UNITS = ['1ª VARA CÍVEL', '2ª VARA CÍVEL', '3ª VARA CÍVEL', '4ª VARA CÍVEL'];
  var HEADERS = ['schemaVersion','year','unit','distributed','entries','exits','judged',
    'fulfillment','necessary','sourceUpdatedAt','collectedAt','monthlyJson'];
  function requireValid(condition) { if (!condition) throw new Error('META1_INVALID_SNAPSHOT'); }
  function utc(value) {
    requireValid(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value));
    var date = new Date(value);
    requireValid(Number.isFinite(date.getTime()) && date.toISOString() === value);
    return date.getTime();
  }
  function calendar(value) { return new Date(utc(value) - 4 * 3600000).toISOString(); }
  function sourceDate(value) {
    requireValid(typeof value === 'string');
    var match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
    requireValid(!!match);
    utc(match[3] + '-' + match[2] + '-' + match[1] + 'T' + match[4] + ':' + match[5] + ':' + match[6] + '.000Z');
  }
  function validateSnapshot(snapshot) {
    requireValid(snapshot && snapshot.schemaVersion === 1 && snapshot.sourceUrl === SOURCE);
    requireValid(Number.isSafeInteger(snapshot.year) && snapshot.year >= 2000 && snapshot.year <= 9999);
    var collected = calendar(snapshot.collectedAt);
    requireValid(Number(collected.slice(0, 4)) === snapshot.year);
    sourceDate(snapshot.sourceUpdatedAt);
    requireValid(Array.isArray(snapshot.units) && snapshot.units.length === 4);
    var seen = {};
    snapshot.units.forEach(function (unit) {
      requireValid(unit && UNITS.indexOf(unit.name) !== -1 && !seen[unit.name]);
      seen[unit.name] = true;
      ['distributed','entries','exits','judged'].forEach(function (field) {
        requireValid(Number.isSafeInteger(unit[field]) && unit[field] >= 0);
      });
      requireValid(Number.isFinite(unit.fulfillment) && unit.fulfillment >= 0 && Number.isSafeInteger(unit.necessary));
      requireValid(Array.isArray(unit.monthly) && unit.monthly.length > 0);
      var periods = {};
      unit.monthly.forEach(function (month) {
        requireValid(month && typeof month.period === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month.period));
        requireValid(!periods[month.period] && Number.isFinite(month.fulfillment) && month.fulfillment >= 0);
        requireValid(month.period <= collected.slice(0, 7) &&
          (Number(month.period.slice(0, 4)) === snapshot.year || month.period === (snapshot.year - 1) + '-12'));
        periods[month.period] = true;
      });
      requireValid(unit.monthly.some(function (month) { return Number(month.period.slice(0, 4)) === snapshot.year; }));
    });
    return snapshot;
  }
  function normalizeProbe(raw) {
    requireValid(raw && Array.isArray(raw.results));
    var updated = null;
    var names = { distributed: 'Casos Novos', entries: 'Entrada', exits: 'Saída', judged: 'Julgados',
      fulfillment: 'GC - Meta 1', necessary: 'Necessário para a Meta' };
    var units = raw.results.map(function (result) {
      requireValid(result && Array.isArray(result.indicators));
      var indicators = {};
      result.indicators.forEach(function (item) {
        requireValid(item && typeof item.label === 'string' && !Object.prototype.hasOwnProperty.call(indicators, item.label));
        indicators[item.label] = item;
      });
      requireValid(result.indicators.length === 7 && indicators['Última Atualização']);
      var stamp = indicators['Última Atualização'].text;
      if (updated === null) updated = stamp;
      requireValid(stamp === updated);
      var unit = { name: result.unit };
      Object.keys(names).forEach(function (key) { requireValid(!!indicators[names[key]]); unit[key] = indicators[names[key]].value; });
      requireValid(result.monthly && Array.isArray(result.monthly.rows) &&
        result.monthly.dimensions.length === 1 && result.monthly.measures.length === 1 && result.monthly.measures[0] === 'GC Acumulado');
      unit.monthly = result.monthly.rows.map(function (row) {
        requireValid(Array.isArray(row) && row.length === 2 && row[0] && row[1] && Number.isSafeInteger(row[0].value));
        var period = String(row[0].value);
        requireValid(/^\d{6}$/.test(period));
        return { period: period.slice(0,4) + '-' + period.slice(4), fulfillment: row[1].value };
      }).sort(function (a,b) { return a.period.localeCompare(b.period); });
      return unit;
    }).sort(function (a,b) { return UNITS.indexOf(a.name) - UNITS.indexOf(b.name); });
    return validateSnapshot({ schemaVersion: 1, year: raw.year, collectedAt: raw.collectedAt,
      sourceUpdatedAt: updated, sourceUrl: SOURCE, units: units });
  }
  function toRows(snapshot) {
    validateSnapshot(snapshot);
    return [HEADERS.slice()].concat(snapshot.units.map(function (unit) {
      return [1,snapshot.year,unit.name,unit.distributed,unit.entries,unit.exits,unit.judged,
        unit.fulfillment,unit.necessary,snapshot.sourceUpdatedAt,snapshot.collectedAt,JSON.stringify(unit.monthly)];
    }));
  }
  function fromRows(rows) {
    requireValid(Array.isArray(rows) && rows.length === 5 && rows.every(function (row) { return Array.isArray(row) && row.length === 12; }));
    requireValid(rows[0].every(function (value,index) { return value === HEADERS[index]; }));
    var first = rows[1];
    var units = rows.slice(1).map(function (row) {
      requireValid([0,1,9,10].every(function (index) { return row[index] === first[index]; }) && row[0] === 1);
      return { name: row[2], distributed: row[3], entries: row[4], exits: row[5], judged: row[6],
        fulfillment: row[7], necessary: row[8], monthly: JSON.parse(row[11]) };
    }).sort(function (a,b) { return UNITS.indexOf(a.name) - UNITS.indexOf(b.name); });
    return validateSnapshot({ schemaVersion: first[0], year: first[1], sourceUpdatedAt: first[9],
      collectedAt: first[10], sourceUrl: SOURCE, units: units });
  }
  function buildView(snapshot, nowIso) {
    if (!snapshot) return { status: 'empty', stale: false, snapshot: null };
    try {
      validateSnapshot(snapshot);
      var local = calendar(nowIso), elapsed = utc(nowIso) - utc(snapshot.collectedAt);
      if (snapshot.year !== Number(local.slice(0,4)) || elapsed < 0) throw new Error('Outdated year');
      var projected = JSON.parse(JSON.stringify(snapshot));
      projected.units.forEach(function (unit) {
        unit.monthly = unit.monthly.filter(function (month) { return Number(month.period.slice(0,4)) === snapshot.year; })
          .sort(function (a,b) { return a.period.localeCompare(b.period); });
      });
      return { status: 'ready', stale: elapsed > 12 * 3600000, currentPeriod: local.slice(0,7), snapshot: projected };
    } catch (error) { return { status: 'unavailable', stale: false, snapshot: null }; }
  }
  return { normalizeProbe: normalizeProbe, validateSnapshot: validateSnapshot, toRows: toRows,
    fromRows: fromRows, buildView: buildView };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Meta1Domain;
