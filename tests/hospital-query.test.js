const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeQueryValue,
  queryHospitals,
  resolveDepartment,
  resolveRowLimit
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

test('row limits retain v2-compatible defaults and bounds', () => {
  assert.equal(resolveRowLimit(undefined), 10);
  assert.equal(resolveRowLimit('0'), 10);
  assert.equal(resolveRowLimit('-1'), 1);
  assert.equal(resolveRowLimit('999'), 30);
});
