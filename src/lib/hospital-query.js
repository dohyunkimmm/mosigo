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

function resolveBooleanFlag(value) {
  const normalized = normalizeQueryValue(value).toLowerCase();
  if (!normalized) return false;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function resolveSort(value) {
  const normalized = normalizeQueryValue(value).toLowerCase();
  return ['recommended', 'rating', 'wait'].includes(normalized) ? normalized : 'recommended';
}

function matchesFreeText(hospital, query) {
  const haystack = [
    hospital.name,
    hospital.dept,
    hospital.type,
    hospital.addr,
    ...(hospital.specialties || [])
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query.toLowerCase()) || query.includes((hospital.dept || '').toLowerCase());
}

function sortHospitals(items, sort) {
  const sorted = items.slice();
  if (sort === 'rating') {
    return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviewCount || 0) - (a.reviewCount || 0));
  }
  if (sort === 'wait') {
    return sorted.sort((a, b) => {
      const aw = Number.isFinite(a.availability?.waitMin) ? a.availability.waitMin : Number.POSITIVE_INFINITY;
      const bw = Number.isFinite(b.availability?.waitMin) ? b.availability.waitMin : Number.POSITIVE_INFINITY;
      return aw - bw || (b.rating || 0) - (a.rating || 0);
    });
  }
  return sorted.sort((a, b) => {
    const aOpen = a.availability?.openNow ? 1 : 0;
    const bOpen = b.availability?.openNow ? 1 : 0;
    const aMgr = Array.isArray(a.mgrIds) ? a.mgrIds.length : 0;
    const bMgr = Array.isArray(b.mgrIds) ? b.mgrIds.length : 0;
    return bOpen - aOpen || bMgr - aMgr || (b.rating || 0) - (a.rating || 0);
  });
}

function queryHospitalResult(query = {}) {
  const qn = normalizeQueryValue(query.qn);
  const qd = normalizeQueryValue(query.qd);
  const limit = resolveRowLimit(query.numOfRows);
  const managerAvailable = resolveBooleanFlag(query.managerAvailable);
  const sameDay = resolveBooleanFlag(query.sameDay);
  const sort = resolveSort(query.sort);

  let items = HOSPITALS.slice();

  if (qd) {
    const department = resolveDepartment(qd);
    items = items.filter((hospital) => (hospital.dept || '').includes(department));
  } else if (qn) {
    items = items.filter((hospital) => matchesFreeText(hospital, qn));
  }

  if (managerAvailable) {
    items = items.filter((hospital) => Array.isArray(hospital.mgrIds) && hospital.mgrIds.length > 0);
  }

  if (sameDay) {
    items = items.filter((hospital) => hospital.availability?.sameDay === true);
  }

  const total = items.length;
  items = sortHospitals(items, sort).slice(0, limit);

  return {
    items,
    meta: {
      total,
      returned: items.length,
      limit,
      sort,
      filters: {
        department: qd ? resolveDepartment(qd) : '',
        query: qn,
        managerAvailable,
        sameDay
      }
    }
  };
}

function queryHospitals(query = {}) {
  return queryHospitalResult(query).items;
}

module.exports = {
  normalizeQueryValue,
  queryHospitalResult,
  queryHospitals,
  resolveBooleanFlag,
  resolveDepartment,
  resolveRowLimit,
  resolveSort,
  sortHospitals
};
