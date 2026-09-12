const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeQueryValue,
  queryHospitalResult,
  queryHospitals,
  resolveBooleanFlag,
  resolveDepartment,
  resolveRowLimit,
  resolveSort
} = require('../src/lib/hospital-query');

test('query values are normalized before filtering', () => {
  assert.equal(normalizeQueryValue(null), '');
  assert.equal(normalizeQueryValue('  내과  '), '내과');
});

test('department codes resolve to prototype department names', () => {
  assert.equal(resolveDepartment('D006'), '정형외과');
  assert.equal(resolveDepartment(' 안과 '), '안과');
});

test('hospital query applies department-code filtering', () => {
  const items = queryHospitals({ qd: ' D006 ' });
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.dept.includes('정형외과')));
});

test('department filter takes precedence over free-text query', () => {
  const items = queryHospitals({ qn: '안과', qd: 'D001' });
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.dept.includes('내과')));
});

test('free-text search includes prototype specialties', () => {
  const items = queryHospitals({ qn: '이명' });
  assert.ok(items.length > 0);
  assert.ok(items.some((item) => item.specialties.includes('이명')));
});

test('row limits retain v2-compatible defaults and bounds', () => {
  assert.equal(resolveRowLimit(undefined), 10);
  assert.equal(resolveRowLimit('0'), 10);
  assert.equal(resolveRowLimit('-1'), 1);
  assert.equal(resolveRowLimit('999'), 30);
});

test('boolean filters accept common truthy query values', () => {
  assert.equal(resolveBooleanFlag('1'), true);
  assert.equal(resolveBooleanFlag('TRUE'), true);
  assert.equal(resolveBooleanFlag('yes'), true);
  assert.equal(resolveBooleanFlag('0'), false);
  assert.equal(resolveBooleanFlag(undefined), false);
});

test('managerAvailable hides hospitals without linked managers', () => {
  const items = queryHospitals({ managerAvailable: '1' });
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.mgrIds.length > 0));
});

test('sameDay filter only returns same-day prototype availability', () => {
  const items = queryHospitals({ sameDay: 'true' });
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.availability.sameDay === true));
});

test('rating and wait sorts are deterministic', () => {
  assert.equal(resolveSort('unknown'), 'recommended');
  const ratingItems = queryHospitals({ sort: 'rating' });
  for (let i = 1; i < ratingItems.length; i += 1) {
    assert.ok(ratingItems[i - 1].rating >= ratingItems[i].rating);
  }

  const waitItems = queryHospitals({ sort: 'wait' });
  const waits = waitItems.map((item) => item.availability.waitMin == null ? Infinity : item.availability.waitMin);
  for (let i = 1; i < waits.length; i += 1) {
    assert.ok(waits[i - 1] <= waits[i]);
  }
});

test('query result exposes applied filters and counts without breaking items contract', () => {
  const result = queryHospitalResult({ qd: 'D001', managerAvailable: '1', sameDay: '1', numOfRows: '1' });
  assert.equal(result.items.length, 1);
  assert.equal(result.meta.returned, 1);
  assert.ok(result.meta.total >= result.meta.returned);
  assert.equal(result.meta.filters.department, '내과');
  assert.equal(result.meta.filters.managerAvailable, true);
  assert.equal(result.meta.filters.sameDay, true);
});
