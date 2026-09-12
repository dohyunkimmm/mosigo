const { HOSPITALS, DEPARTMENT_BY_CODE } = require('../data/hospitals');

function normalizeQueryValue(value) {
  return String(value == null ? '' : value).trim();
}

function resolveDepartment(value) {
  const query = normalizeQueryValue(value);
  return DEPARTMENT_BY_CODE[query] || query;
}

function resolveRowLimit(value) {
  const parsed = Number(value) || 10;
  return Math.max(1, Math.min(30, parsed));
}

function queryHospitals(query = {}) {
  const qn = normalizeQueryValue(query.qn);
  const qd = normalizeQueryValue(query.qd);
  const limit = resolveRowLimit(query.numOfRows);

  let items = HOSPITALS.slice();

  if (qd) {
    const department = resolveDepartment(qd);
    items = items.filter((hospital) => (hospital.dept || '').includes(department));
  } else if (qn) {
    items = items.filter((hospital) =>
      (hospital.name || '').includes(qn) ||
      (hospital.dept || '').includes(qn) ||
      qn.includes(hospital.dept || '')
    );
  }

  return items.slice(0, limit);
}

module.exports = {
  normalizeQueryValue,
  queryHospitals,
  resolveDepartment,
  resolveRowLimit
};
