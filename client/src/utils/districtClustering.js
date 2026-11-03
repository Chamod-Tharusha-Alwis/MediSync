/**
 * 25 Administrative Districts of Sri Lanka grouped into 9 Provincial Clusters.
 */
export const PROVINCE_CLUSTERS = {
  western: {
    id: 'western',
    name: 'Western Province',
    labelKey: 'public.clusterWestern',
    districts: ['Colombo', 'Gampaha', 'Kalutara']
  },
  central: {
    id: 'central',
    name: 'Central Province',
    labelKey: 'public.clusterCentral',
    districts: ['Kandy', 'Matale', 'Nuwara Eliya']
  },
  southern: {
    id: 'southern',
    name: 'Southern Province',
    labelKey: 'public.clusterSouthern',
    districts: ['Galle', 'Matara', 'Hambantota']
  },
  northern: {
    id: 'northern',
    name: 'Northern Province',
    labelKey: 'public.clusterNorthern',
    districts: ['Jaffna', 'Kilinochchi', 'Mannar', 'Mullaitivu', 'Vavuniya']
  },
  eastern: {
    id: 'eastern',
    name: 'Eastern Province',
    labelKey: 'public.clusterEastern',
    districts: ['Batticaloa', 'Ampara', 'Trincomalee']
  },
  north_western: {
    id: 'north_western',
    name: 'North Western Province',
    labelKey: 'public.clusterNorthWestern',
    districts: ['Kurunegala', 'Puttalam']
  },
  north_central: {
    id: 'north_central',
    name: 'North Central Province',
    labelKey: 'public.clusterNorthCentral',
    districts: ['Anuradhapura', 'Polonnaruwa']
  },
  uva: {
    id: 'uva',
    name: 'Uva Province',
    labelKey: 'public.clusterUva',
    districts: ['Badulla', 'Monaragala']
  },
  sabaragamuwa: {
    id: 'sabaragamuwa',
    name: 'Sabaragamuwa Province',
    labelKey: 'public.clusterSabaragamuwa',
    districts: ['Ratnapura', 'Kegalle']
  }
};

/**
 * Normalizes district names across GeoJSON properties, DB records, and user input.
 * Handles space variants and Monaragala/Moneragala, Nuwara Eliya/NuwaraEliya.
 */
export function normalizeDistrict(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace('monaragala', 'moneragala');
}

/**
 * Standard 5-tier epidemiological risk levels.
 * Hex colors maintain exact verified visual baseline.
 */
export const RISK_TIERS = {
  critical: {
    id: 'critical',
    labelKey: 'public.riskCritical',
    defaultLabel: 'Critical (>1,000 cases)',
    color: '#9B2C2C', // Dark Red
    activeColor: '#ef4444',
    badgeClass: 'bg-red-500/20 text-red-300 border-red-500/40',
    minCases: 1000
  },
  high: {
    id: 'high',
    labelKey: 'public.riskHigh',
    defaultLabel: 'High (500–1,000 cases)',
    color: '#C53030', // Deep Crimson
    activeColor: '#f97316',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    minCases: 500
  },
  moderate: {
    id: 'moderate',
    labelKey: 'public.riskModerate',
    defaultLabel: 'Moderate (100–500 cases)',
    color: '#DD6B20', // Amber
    activeColor: '#eab308',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    minCases: 100
  },
  low: {
    id: 'low',
    labelKey: 'public.riskLow',
    defaultLabel: 'Low (10–100 cases)',
    color: '#D69E2E', // Gold
    activeColor: '#3b82f6',
    badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    minCases: 10
  },
  minimal: {
    id: 'minimal',
    labelKey: 'public.riskMinimal',
    defaultLabel: 'Minimal (<10 cases)',
    color: '#319795', // Teal
    activeColor: '#10b981',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    minCases: 0
  },
  nodata: {
    id: 'nodata',
    labelKey: 'public.noCasesRecorded',
    defaultLabel: 'No data (<5)',
    color: '#334155', // Slate Gray
    activeColor: '#64748b',
    badgeClass: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
    minCases: 0
  }
};

/**
 * Adjacency graph connecting neighboring districts for transmission corridor analysis.
 */
export const DISTRICT_ADJACENCY = {
  colombo: ['gampaha', 'kalutara', 'kegalle'],
  gampaha: ['colombo', 'kalutara', 'kegalle', 'kurunegala'],
  kalutara: ['colombo', 'gampaha', 'ratnapura', 'galle'],
  kandy: ['matale', 'nuwaraeliya', 'kurunegala', 'kegalle', 'badulla'],
  matale: ['kandy', 'anuradhapura', 'polonnaruwa', 'kurunegala', 'badulla'],
  nuwaraeliya: ['kandy', 'badulla', 'ratnapura', 'kegalle'],
  galle: ['kalutara', 'matara', 'ratnapura'],
  matara: ['galle', 'hambantota', 'ratnapura'],
  hambantota: ['matara', 'moneragala', 'ratnapura'],
  jaffna: ['kilinochchi'],
  kilinochchi: ['jaffna', 'mannar', 'mullaitivu'],
  mannar: ['kilinochchi', 'mullaitivu', 'vavuniya', 'anuradhapura', 'puttalam'],
  mullaitivu: ['kilinochchi', 'mannar', 'vavuniya', 'trincomalee'],
  vavuniya: ['mannar', 'mullaitivu', 'anuradhapura', 'trincomalee'],
  batticaloa: ['ampara', 'polonnaruwa'],
  ampara: ['batticaloa', 'moneragala', 'badulla', 'polonnaruwa', 'hambantota'],
  trincomalee: ['mullaitivu', 'vavuniya', 'anuradhapura', 'polonnaruwa'],
  kurunegala: ['gampaha', 'puttalam', 'anuradhapura', 'matale', 'kandy', 'kegalle'],
  puttalam: ['kurunegala', 'mannar', 'anuradhapura', 'gampaha'],
  anuradhapura: ['puttalam', 'mannar', 'vavuniya', 'trincomalee', 'polonnaruwa', 'matale', 'kurunegala'],
  polonnaruwa: ['anuradhapura', 'trincomalee', 'batticaloa', 'matale', 'ampara'],
  badulla: ['kandy', 'matale', 'nuwaraeliya', 'moneragala', 'ampara', 'ratnapura'],
  moneragala: ['badulla', 'ampara', 'hambantota', 'ratnapura'],
  ratnapura: ['kalutara', 'colombo', 'kegalle', 'nuwaraeliya', 'badulla', 'moneragala', 'hambantota', 'matara', 'galle'],
  kegalle: ['gampaha', 'colombo', 'kurunegala', 'kandy', 'nuwaraeliya', 'ratnapura']
};

/**
 * Returns district's parent province cluster.
 */
export function getDistrictCluster(districtName) {
  const norm = normalizeDistrict(districtName);
  for (const cluster of Object.values(PROVINCE_CLUSTERS)) {
    if (cluster.districts.some(d => normalizeDistrict(d) === norm)) {
      return cluster;
    }
  }
  return null;
}

/**
 * Evaluates district risk tier based on cases count and optional alert severity.
 */
export function getRiskTier(cases, alertLevel) {
  const count = typeof cases === 'number' ? cases : 0;
  const alert = String(alertLevel || '').toLowerCase();

  if (alert === 'critical' || count > 1000) return RISK_TIERS.critical;
  if (alert === 'high' || count > 500) return RISK_TIERS.high;
  if (alert === 'moderate' || count > 100) return RISK_TIERS.moderate;
  if (count > 10) return RISK_TIERS.low;
  if (count > 0) return RISK_TIERS.minimal;
  return RISK_TIERS.nodata;
}

/**
 * Evaluates 25-district data into regional cluster health summaries
 * and identifies multi-district elevated transmission contagion corridors.
 */
export function computeRegionalClusters(byDistrictData = [], activeAlerts = []) {
  const districtMap = new Map();
  for (const item of byDistrictData) {
    if (!item || !item.district) continue;
    districtMap.set(normalizeDistrict(item.district), {
      district: item.district,
      totalCases: Number(item.totalCases) || 0,
      topDisease: item.topDisease || 'Unknown'
    });
  }

  const alertMap = new Map();
  for (const alert of activeAlerts) {
    if (!alert || !alert.district) continue;
    alertMap.set(normalizeDistrict(alert.district), alert.level || alert.severity || 'Critical');
  }

  const clusters = [];
  const contagionDistrictSet = new Set();

  for (const [clusterKey, cluster] of Object.entries(PROVINCE_CLUSTERS)) {
    let clusterCases = 0;
    const districtStats = [];
    let highOrCriticalCount = 0;

    for (const dName of cluster.districts) {
      const norm = normalizeDistrict(dName);
      const data = districtMap.get(norm) || { district: dName, totalCases: 0, topDisease: 'None' };
      const alertLevel = alertMap.get(norm);
      const risk = getRiskTier(data.totalCases, alertLevel);

      clusterCases += data.totalCases;
      const isHighOrCritical = risk.id === 'critical' || risk.id === 'high';
      if (isHighOrCritical) highOrCriticalCount++;

      districtStats.push({
        district: dName,
        totalCases: data.totalCases,
        topDisease: data.topDisease,
        riskTier: risk,
        alertLevel: alertLevel || null,
        isHighOrCritical
      });
    }

    // A cluster is flagged as a Regional Contagion Cluster if 2+ districts have High/Critical risk,
    // or if at least one is Critical and adjacent neighbors in neighboring districts have High/Critical transmission.
    let isContagionCluster = highOrCriticalCount >= 2;

    if (!isContagionCluster && highOrCriticalCount === 1) {
      // Check if the high/critical district has an adjacent high/critical neighbor across provincial border
      const elevatedDist = districtStats.find(d => d.isHighOrCritical);
      if (elevatedDist) {
        const neighbors = DISTRICT_ADJACENCY[normalizeDistrict(elevatedDist.district)] || [];
        for (const n of neighbors) {
          const neighborData = districtMap.get(n);
          if (neighborData && neighborData.totalCases >= 500) {
            isContagionCluster = true;
            break;
          }
        }
      }
    }

    if (isContagionCluster) {
      for (const d of districtStats) {
        if (d.isHighOrCritical) {
          contagionDistrictSet.add(normalizeDistrict(d.district));
        }
      }
    }

    // Calculate cluster max risk tier
    let maxRiskTier = RISK_TIERS.nodata;
    for (const d of districtStats) {
      if (d.riskTier.id === 'critical') {
        maxRiskTier = RISK_TIERS.critical;
        break;
      }
      if (d.riskTier.id === 'high' && maxRiskTier.id !== 'critical') {
        maxRiskTier = RISK_TIERS.high;
      } else if (d.riskTier.id === 'moderate' && !['critical', 'high'].includes(maxRiskTier.id)) {
        maxRiskTier = RISK_TIERS.moderate;
      } else if (d.riskTier.id === 'low' && !['critical', 'high', 'moderate'].includes(maxRiskTier.id)) {
        maxRiskTier = RISK_TIERS.low;
      } else if (d.riskTier.id === 'minimal' && maxRiskTier.id === 'nodata') {
        maxRiskTier = RISK_TIERS.minimal;
      }
    }

    clusters.push({
      key: clusterKey,
      id: cluster.id,
      name: cluster.name,
      labelKey: cluster.labelKey,
      districts: districtStats,
      totalCases: clusterCases,
      highOrCriticalCount,
      isContagionCluster,
      maxRiskTier
    });
  }

  return {
    clusters,
    isDistrictInContagionCluster: (districtName) => contagionDistrictSet.has(normalizeDistrict(districtName)),
    contagionDistricts: Array.from(contagionDistrictSet)
  };
}
