/**
 * 25-District Adjacency Topology, Name Normalization, and Spatial Clustering
 * for MediSync Outbreak Surveillance (Milestone 2, Feature C3).
 */

export const SRI_LANKA_DISTRICT_ADJACENCY = {
  'Ampara': ['Badulla', 'Batticaloa', 'Hambantota', 'Matale', 'Monaragala', 'Polonnaruwa'],
  'Anuradhapura': ['Kurunegala', 'Mannar', 'Matale', 'Polonnaruwa', 'Puttalam', 'Trincomalee', 'Vavuniya'],
  'Badulla': ['Ampara', 'Kandy', 'Matale', 'Monaragala', 'Nuwara Eliya', 'Ratnapura'],
  'Batticaloa': ['Ampara', 'Polonnaruwa', 'Trincomalee'],
  'Colombo': ['Gampaha', 'Kalutara', 'Kegalle', 'Ratnapura'],
  'Galle': ['Kalutara', 'Matara', 'Ratnapura'],
  'Gampaha': ['Colombo', 'Kegalle', 'Kurunegala', 'Puttalam'],
  'Hambantota': ['Ampara', 'Matara', 'Monaragala', 'Ratnapura'],
  'Jaffna': ['Kilinochchi'],
  'Kalutara': ['Colombo', 'Galle', 'Ratnapura'],
  'Kandy': ['Badulla', 'Kegalle', 'Kurunegala', 'Matale', 'Nuwara Eliya'],
  'Kegalle': ['Colombo', 'Gampaha', 'Kandy', 'Kurunegala', 'Nuwara Eliya', 'Ratnapura'],
  'Kilinochchi': ['Jaffna', 'Mannar', 'Mullaitivu'],
  'Kurunegala': ['Anuradhapura', 'Gampaha', 'Kandy', 'Kegalle', 'Matale', 'Puttalam'],
  'Mannar': ['Anuradhapura', 'Kilinochchi', 'Mullaitivu', 'Puttalam', 'Vavuniya'],
  'Matale': ['Ampara', 'Anuradhapura', 'Badulla', 'Kandy', 'Kurunegala', 'Polonnaruwa'],
  'Matara': ['Galle', 'Hambantota', 'Ratnapura'],
  'Monaragala': ['Ampara', 'Badulla', 'Hambantota', 'Ratnapura'],
  'Mullaitivu': ['Kilinochchi', 'Mannar', 'Trincomalee', 'Vavuniya'],
  'Nuwara Eliya': ['Badulla', 'Kandy', 'Kegalle', 'Ratnapura'],
  'Polonnaruwa': ['Ampara', 'Anuradhapura', 'Batticaloa', 'Matale', 'Trincomalee'],
  'Puttalam': ['Anuradhapura', 'Gampaha', 'Kurunegala', 'Mannar'],
  'Ratnapura': ['Badulla', 'Colombo', 'Galle', 'Hambantota', 'Kalutara', 'Kegalle', 'Matara', 'Monaragala', 'Nuwara Eliya'],
  'Trincomalee': ['Anuradhapura', 'Batticaloa', 'Mullaitivu', 'Polonnaruwa', 'Vavuniya'],
  'Vavuniya': ['Anuradhapura', 'Mannar', 'Mullaitivu', 'Trincomalee']
};

export const DISTRICT_ADJACENCY = SRI_LANKA_DISTRICT_ADJACENCY;

export const ALL_DISTRICTS = Object.keys(SRI_LANKA_DISTRICT_ADJACENCY);

/**
 * Normalizes district names across diverse sources:
 * - Nuwara Eliya <-> NuwaraEliya
 * - Monaragala <-> Moneragala
 */
export function normalizeDistrictName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace('moneragala', 'monaragala');
}

/**
 * Converts stored or lower/snake_case district names into canonical display strings:
 * - 'nuwara_eliya' -> 'Nuwara Eliya'
 * - 'moneragala' -> 'Monaragala'
 * - 'kandy' -> 'Kandy'
 */
export function formatDistrictName(name) {
  if (!name || typeof name !== 'string') return '';
  const norm = normalizeDistrictName(name);
  const canonical = ALL_DISTRICTS.find(d => normalizeDistrictName(d) === norm);
  if (canonical) return canonical;
  return name.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}


export const RISK_TIERS = {
  CRITICAL:   { key: 'critical',   minCases: 1001, color: '#9B2C2C', label: 'Critical' },
  HIGH:       { key: 'high',       minCases: 501,  color: '#C53030', label: 'High' },
  MODERATE:   { key: 'moderate',   minCases: 101,  color: '#DD6B20', label: 'Moderate' },
  LOW:        { key: 'low',        minCases: 11,   color: '#D69E2E', label: 'Low' },
  MINIMAL:    { key: 'minimal',    minCases: 1,    color: '#319795', label: 'Minimal' },
  SUPPRESSED: { key: 'suppressed', minCases: 0,    color: '#1e293b', label: 'No Data (<5)' }
};

export function getRiskTier(count) {
  if (count > 1000) return RISK_TIERS.CRITICAL;
  if (count > 500)  return RISK_TIERS.HIGH;
  if (count > 100)  return RISK_TIERS.MODERATE;
  if (count > 10)   return RISK_TIERS.LOW;
  if (count >= 1)   return RISK_TIERS.MINIMAL;
  return RISK_TIERS.SUPPRESSED;
}

/**
 * Breadth-First Search (BFS) connected-components algorithm
 * finding contiguous high-risk clusters (>500 cases).
 *
 * @param {Array<{district: string, totalCases: number, topDisease: string}>} districtList
 * @returns {{ clusters: Array, districtClusterMap: Map }}
 */
export function computeOutbreakClusters(districtList = []) {
  const normDataMap = new Map();
  for (const d of districtList) {
    if (d && d.district) {
      normDataMap.set(normalizeDistrictName(d.district), d);
    }
  }

  // Canonical high-risk set (Critical or High: totalCases > 500)
  const highRiskCanonSet = new Set();
  for (const [canonName] of Object.entries(SRI_LANKA_DISTRICT_ADJACENCY)) {
    const data = normDataMap.get(normalizeDistrictName(canonName));
    const cases = data ? (data.totalCases || 0) : 0;
    if (cases > 500) {
      highRiskCanonSet.add(canonName);
    }
  }

  const visited = new Set();
  const clusters = [];
  const districtClusterMap = new Map();
  let clusterIndex = 1;

  for (const district of highRiskCanonSet) {
    if (visited.has(district)) continue;

    const component = [];
    const queue = [district];
    visited.add(district);

    while (queue.length > 0) {
      const current = queue.shift();
      component.push(current);

      const neighbors = SRI_LANKA_DISTRICT_ADJACENCY[current] || [];
      for (const neighbor of neighbors) {
        if (highRiskCanonSet.has(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    const isContiguousCluster = component.length >= 2;
    const clusterId = `Cluster ${clusterIndex++}`;
    const totalCases = component.reduce((sum, name) => {
      const d = normDataMap.get(normalizeDistrictName(name));
      return sum + (d?.totalCases || 0);
    }, 0);

    const clusterObj = {
      id: clusterId,
      districts: component,
      isContiguousCluster,
      totalCases,
      dominantDisease: normDataMap.get(normalizeDistrictName(component[0]))?.topDisease || 'Unknown'
    };

    clusters.push(clusterObj);
    for (const name of component) {
      districtClusterMap.set(normalizeDistrictName(name), clusterObj);
    }
  }

  return { clusters, districtClusterMap };
}

const districtAdjacencyModule = {
  SRI_LANKA_DISTRICT_ADJACENCY,
  DISTRICT_ADJACENCY,
  ALL_DISTRICTS,
  normalizeDistrictName,
  formatDistrictName,
  RISK_TIERS,
  getRiskTier,
  computeOutbreakClusters
};

export default districtAdjacencyModule;
