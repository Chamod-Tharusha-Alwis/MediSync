'use strict';

const Consultation = require('../models/Consultation');
const { icd10 } = require('../utils/loadDatasets');
const whoIcd11Service = require('./whoIcd11Service');
const incidenceService = require('./incidenceService');
const publicHealthStats = require('./publicHealthStats');
const { PROVINCE_TO_DISTRICTS } = require('./surveillanceService');

const ALL_DISTRICTS = Object.freeze([
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo',
  'Galle', 'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara',
  'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar',
  'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya',
  'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya'
]);

const LOCALIZED_DISEASE_KEYWORDS = Object.freeze([
  { keywords: ['dengue', 'ඩෙංගු', 'டெங்கு'], codes: ['A90', '1D20'] },
  { keywords: ['influenza', 'flu', 'ඉන්ෆ්ලුවෙන්සා', 'උණ', 'இன்புளுவென்சா', 'காய்ச்சல்'], codes: ['J11', 'J10', '1E30'] },
  { keywords: ['typhoid', 'උණ සන්නිපාතය', 'ටයිපොයිඩ්', 'டைபாயிட்'], codes: ['A01', '1C12'] },
  { keywords: ['leptospirosis', 'rat fever', 'මී උණ', 'எலி காய்ச்சல்'], codes: ['A27', '1C80'] },
  { keywords: ['covid', 'කොවිඩ්', 'கோவிட்'], codes: ['U071', 'RA01'] },
  { keywords: ['cholera', 'කොලරාව', 'வாந்திபேதி'], codes: ['A00', '1A00'] },
  { keywords: ['chickenpox', 'පැපොල', 'சின்னம்மை'], codes: ['B01', '1E90'] },
  { keywords: ['measles', 'සරම්ප', 'தட்டம்மை'], codes: ['B05', '1F03'] },
  { keywords: ['malaria', 'මැලේරියාව', 'மலேரியா'], codes: ['B50', 'B54', '1F40'] },
  { keywords: ['diabetes', 'දියවැඩියාව', 'நீரிழிவு'], codes: ['E11', '5A11'] },
  { keywords: ['hypertension', 'අධි රුධිර පීඩනය', 'உயர் இரத்த அழுத்தம்'], codes: ['I10', 'BA00'] },
  { keywords: ['asthma', 'ඇදුම', 'ஆஸ்துமா'], codes: ['J45', 'CA23'] }
]);

/**
 * Autocomplete / search diseases across ICD-10 (71k concepts) and WHO ICD-11 (core catalog)
 * with localized name support and ranking.
 */
function searchDiseases(query, limit = 20) {
  if (!query || typeof query !== 'string') return [];
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const max = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const results = [];
  const seen = new Set();

  const add = (item, score) => {
    const key = `${item.version}:${item.code.toUpperCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ ...item, score });
  };

  // 1. Localized keyword matching (Sinhala, Tamil, common synonyms)
  for (const entry of LOCALIZED_DISEASE_KEYWORDS) {
    if (entry.keywords.some(k => k.toLowerCase().includes(q) || q.includes(k.toLowerCase()))) {
      for (const targetCode of entry.codes) {
        for (const item of whoIcd11Service.CURATED_ICD11_CORE_CATALOG) {
          if (item.code.toUpperCase().startsWith(targetCode.toUpperCase())) {
            add({
              code: item.code,
              description: item.description,
              version: 'ICD-11',
              displayName: `${item.code} - ${item.description}`
            }, 100);
          }
        }
        for (const item of icd10) {
          if (item.code.toUpperCase().startsWith(targetCode.toUpperCase())) {
            add({
              code: item.code,
              description: item.description,
              version: 'ICD-10',
              displayName: `${item.code} - ${item.description}`
            }, 90);
          }
        }
      }
    }
  }

  // 2. Search ICD-11 core catalog
  for (const item of whoIcd11Service.CURATED_ICD11_CORE_CATALOG) {
    const c = item.code.toLowerCase();
    const d = item.description.toLowerCase();
    let score = 0;
    if (c === q || c.replace('.', '') === q) score = 100;
    else if (c.startsWith(q)) score = 80;
    else if (d.startsWith(q)) score = 70;
    else if (d.includes(q)) score = 50;

    if (score > 0) {
      add({
        code: item.code,
        description: item.description,
        version: 'ICD-11',
        displayName: `${item.code} - ${item.description}`
      }, score);
    }
  }

  // 3. Search ICD-10 full catalog
  for (const item of icd10) {
    const c = item.code.toLowerCase();
    const d = item.description.toLowerCase();
    let score = 0;
    if (c === q || c.replace('.', '') === q) score = 95;
    else if (c.startsWith(q)) score = 75;
    else if (d.startsWith(q)) score = 65;
    else if (d.includes(q)) score = 40;

    if (score > 0) {
      add({
        code: item.code,
        description: item.description,
        version: 'ICD-10',
        displayName: `${item.code} - ${item.description}`
      }, score);
      if (results.length >= max * 3) break;
    }
  }

  results.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  return results.slice(0, max).map(({ score, ...item }) => item);
}

/**
 * Builds query filter for dotted and dotless ICD code variants.
 */
function buildIcdCodeQuery(code) {
  const clean = String(code || '').replace(/^ICD(10|11):/i, '').trim();
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const dotless = clean.replace(/\./g, '');
  const escapedDotless = dotless.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  if (clean.includes('.')) {
    return {
      icdCode: { $regex: new RegExp(`^(${escaped}|${escapedDotless})$`, 'i') }
    };
  } else {
    return {
      icdCode: { $regex: new RegExp(`^(${escaped}(\\.[0-9A-Za-z]+)?|${escapedDotless}[0-9A-Za-z]*)$`, 'i') }
    };
  }
}

/**
 * Returns disease label, version and display name.
 */
function getDiseaseDetails(code) {
  const clean = String(code || '').replace(/^ICD(10|11):/i, '').trim();
  const dotless = clean.replace(/\./g, '').toUpperCase();

  const m11 = whoIcd11Service.CURATED_ICD11_CORE_CATALOG.find(x =>
    x.code.toUpperCase() === clean.toUpperCase() || x.code.replace('.', '').toUpperCase() === dotless
  );
  if (m11) {
    return { code: m11.code, description: m11.description, version: 'ICD-11', displayName: `${m11.code} - ${m11.description}` };
  }

  const m10 = icd10.find(x =>
    x.code.toUpperCase() === clean.toUpperCase() || x.code.replace('.', '').toUpperCase() === dotless
  );
  if (m10) {
    return { code: m10.code, description: m10.description, version: 'ICD-10', displayName: `${m10.code} - ${m10.description}` };
  }

  const label = publicHealthStats.diseaseLabel(`ICD10:${dotless}`) || publicHealthStats.diseaseLabel(`ICD10:${clean}`);
  const finalDescription = (label && label !== `ICD10:${dotless}` && label !== `ICD10:${clean}`) ? label : clean;
  return {
    code: clean,
    description: finalDescription,
    version: /^[A-Z][0-9]/.test(clean) ? 'ICD-10' : 'ICD-11',
    displayName: finalDescription !== clean ? `${clean} - ${finalDescription}` : clean
  };
}

/**
 * Generates continuous zero-filled time series between from and to.
 */
function generateZeroFilledSeries({ from, to, bucket, bucketCounts }) {
  const series = [];
  const start = new Date(from);
  const end = new Date(to);

  if (bucket === 'hour') {
    const cur = new Date(start);
    cur.setMinutes(0, 0, 0);
    while (cur <= end) {
      const year = cur.getUTCFullYear();
      const month = String(cur.getUTCMonth() + 1).padStart(2, '0');
      const day = String(cur.getUTCDate()).padStart(2, '0');
      const hour = String(cur.getUTCHours()).padStart(2, '0');
      const key = `${year}-${month}-${day} ${hour}:00`;
      const label = `${cur.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} ${hour}:00`;
      series.push({
        timestamp: cur.toISOString(),
        label,
        count: bucketCounts.get(key) || 0
      });
      cur.setHours(cur.getHours() + 1);
      if (series.length > 1000) break;
    }
  } else if (bucket === 'week') {
    const cur = new Date(start);
    while (cur <= end) {
      const d = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      const isoYear = d.getUTCFullYear();
      const key = `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
      const label = `W${weekNo} (${cur.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })})`;
      series.push({
        timestamp: cur.toISOString(),
        label,
        count: bucketCounts.get(key) || 0
      });
      cur.setDate(cur.getDate() + 7);
      if (series.length > 500) break;
    }
  } else {
    // Default: 'day'
    const cur = new Date(start);
    while (cur <= end) {
      const year = cur.getUTCFullYear();
      const month = String(cur.getUTCMonth() + 1).padStart(2, '0');
      const day = String(cur.getUTCDate()).padStart(2, '0');
      const key = `${year}-${month}-${day}`;
      const label = cur.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      series.push({
        timestamp: cur.toISOString(),
        label,
        count: bucketCounts.get(key) || 0
      });
      cur.setDate(cur.getDate() + 1);
      if (series.length > 1000) break;
    }
  }
  return series;
}

/**
 * Core query aggregating verified consultations for selected disease and range.
 */
async function getDiseaseAnalytics({ code, from, to, bucket } = {}) {
  if (!code || typeof code !== 'string' || !code.trim()) {
    const err = new Error('Disease code is required');
    err.status = 400;
    throw err;
  }

  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(+toDate - 30 * 86400000);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    const err = new Error('Invalid date format');
    err.status = 400;
    throw err;
  }

  if (fromDate.getTime() > toDate.getTime()) {
    const err = new Error('Invalid date range: start date must be before or equal to end date');
    err.status = 400;
    throw err;
  }

  const durationMs = toDate.getTime() - fromDate.getTime();
  const TWO_YEARS_MS = (2 * 365.25 + 1) * 86400000;
  if (durationMs > TWO_YEARS_MS) {
    const err = new Error('Date range cannot exceed 2 years');
    err.status = 400;
    throw err;
  }

  let resolvedBucket = bucket;
  const validBuckets = ['hour', 'day', 'week', 'month'];
  if (!resolvedBucket || !validBuckets.includes(resolvedBucket)) {
    if (durationMs <= 72 * 3600000) resolvedBucket = 'hour';
    else if (durationMs <= 92 * 86400000) resolvedBucket = 'day';
    else resolvedBucket = 'week';
  }

  const diseaseInfo = getDiseaseDetails(code);
  const codeQuery = buildIcdCodeQuery(code);

  const syntheticCriteria = {
    $or: [
      { syntheticSeedBatch: 'viva-2026-11-outbreaks' },
      {
        isSimulation: { $ne: true },
        isTestFixture: { $ne: true },
        isDemoData: { $ne: true },
        isSynthetic: { $ne: true },
        isUniversityDemo: { $ne: true },
        isSyntheticUniversityData: { $ne: true },
        datasetVersion: { $exists: false },
        datasetBatch: { $exists: false },
        testRunId: { $exists: false },
        phase5wOwner: { $exists: false }
      }
    ]
  };

  const verificationCriteria = {
    'surveillanceVerification.status': 'verified',
    'surveillanceVerification.diagnosisStatus': 'confirmed'
  };

  const currentMatch = {
    createdAt: { $gte: fromDate, $lte: toDate },
    ...codeQuery,
    ...verificationCriteria,
    ...syntheticCriteria
  };

  let timeFormat = '%Y-%m-%d';
  if (resolvedBucket === 'hour') timeFormat = '%Y-%m-%d %H:00';
  else if (resolvedBucket === 'week') timeFormat = '%G-W%V';
  else if (resolvedBucket === 'month') timeFormat = '%Y-%m';

  const aggResult = await Consultation.aggregate([
    { $match: currentMatch },
    {
      $facet: {
        byDistrict: [
          { $group: { _id: '$district', count: { $sum: 1 } } }
        ],
        byCalendarDay: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ],
        byTimeBucket: [
          {
            $group: {
              _id: { $dateToString: { format: timeFormat, date: '$createdAt' } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ],
        total: [
          { $count: 'count' }
        ]
      }
    }
  ]);

  const facet = aggResult[0] || {};
  const totalCases = facet.total?.[0]?.count || 0;

  const prevDuration = Math.max(durationMs, 1000);
  const prevTo = new Date(fromDate.getTime());
  const prevFrom = new Date(fromDate.getTime() - prevDuration);

  const prevMatch = {
    createdAt: { $gte: prevFrom, $lt: prevTo },
    ...codeQuery,
    ...verificationCriteria,
    ...syntheticCriteria
  };

  const prevCountAgg = await Consultation.aggregate([
    { $match: prevMatch },
    { $count: 'count' }
  ]);
  const previousPeriodCases = prevCountAgg[0]?.count || 0;

  const change = totalCases - previousPeriodCases;
  let changePct = 0;
  if (previousPeriodCases === 0) {
    changePct = totalCases > 0 ? 'new' : 0;
  } else {
    changePct = Number((((totalCases - previousPeriodCases) / previousPeriodCases) * 100).toFixed(1));
  }

  let peakDay = null;
  if (facet.byCalendarDay && facet.byCalendarDay.length > 0) {
    let maxCount = -1;
    let maxDate = null;
    for (const d of facet.byCalendarDay) {
      if (d.count > maxCount) {
        maxCount = d.count;
        maxDate = d._id;
      }
    }
    if (maxCount > 0) {
      peakDay = { date: maxDate, count: maxCount };
    }
  }

  const districtCounts = {};
  if (Array.isArray(facet.byDistrict)) {
    for (const row of facet.byDistrict) {
      if (row._id) districtCounts[row._id] = row.count;
    }
  }

  let districtsAffected = 0;
  const districts = ALL_DISTRICTS.map(districtName => {
    const cases = districtCounts[districtName] || 0;
    if (cases > 0) districtsAffected++;
    const pop = incidenceService.getDistrictPopulation(districtName);
    const inc = incidenceService.calculateIncidencePer100k(cases, districtName);
    const share = incidenceService.formatPopulationShare(cases, districtName);
    return {
      district: districtName,
      cases,
      population: pop,
      incidencePer100k: inc.incidence ?? 0,
      incidenceDisplay: inc.display,
      formattedShare: share.formattedShare
    };
  });

  districts.sort((a, b) => b.cases - a.cases || a.district.localeCompare(b.district));

  const provinces = Object.entries(PROVINCE_TO_DISTRICTS).map(([provinceName, districtList]) => {
    let cases = 0;
    for (const d of districtList) {
      cases += (districtCounts[d] || 0);
    }
    const pop = incidenceService.getProvincePopulation(provinceName);
    const inc = incidenceService.calculateProvinceIncidencePer100k(cases, provinceName);
    return {
      province: provinceName,
      districts: districtList,
      cases,
      population: pop,
      incidencePer100k: inc.incidence ?? 0,
      incidenceDisplay: inc.display
    };
  });
  provinces.sort((a, b) => b.cases - a.cases || a.province.localeCompare(b.province));

  const islandPopulation = incidenceService.getIslandPopulation();
  const islandIncidence = incidenceService.calculateIslandIncidencePer100k(totalCases);
  const island = {
    totalCases,
    population: islandPopulation,
    incidencePer100k: islandIncidence.incidence ?? 0,
    incidenceDisplay: islandIncidence.display,
    districtsAffected
  };

  const timeBucketsMap = new Map();
  if (Array.isArray(facet.byTimeBucket)) {
    for (const tb of facet.byTimeBucket) {
      if (tb._id) timeBucketsMap.set(tb._id, tb.count);
    }
  }

  const timeSeries = generateZeroFilledSeries({
    from: fromDate,
    to: toDate,
    bucket: resolvedBucket,
    bucketCounts: timeBucketsMap
  });

  return {
    disease: diseaseInfo,
    range: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      bucket: resolvedBucket,
      durationDays: Math.ceil(durationMs / 86400000)
    },
    summary: {
      totalCases,
      districtsAffected,
      previousPeriodCases,
      change,
      changePct,
      peakDay
    },
    timeSeries,
    districts,
    provinces,
    island,
    message: totalCases === 0 ? 'No verified cases for this disease in this period.' : undefined
  };
}

module.exports = {
  searchDiseases,
  getDiseaseAnalytics,
  buildIcdCodeQuery,
  getDiseaseDetails,
  generateZeroFilledSeries,
  ALL_DISTRICTS
};
