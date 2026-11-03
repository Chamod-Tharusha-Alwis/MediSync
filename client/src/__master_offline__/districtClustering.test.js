import {
  PROVINCE_CLUSTERS,
  normalizeDistrict,
  getDistrictCluster,
  getRiskTier,
  computeRegionalClusters,
  RISK_TIERS,
  DISTRICT_ADJACENCY
} from '../utils/districtClustering';

describe('District Clustering & Adjacency Suite (Feature C3)', () => {
  const ALL_25_DISTRICTS = [
    'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo',
    'Galle', 'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara',
    'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar',
    'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya',
    'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya'
  ];

  test('covers all 25 districts across 9 provincial clusters with no duplicates', () => {
    const clusterDistricts = Object.values(PROVINCE_CLUSTERS).flatMap(c => c.districts);
    expect(clusterDistricts).toHaveLength(25);

    const normalizedUnique = new Set(clusterDistricts.map(normalizeDistrict));
    expect(normalizedUnique.size).toBe(25);

    for (const d of ALL_25_DISTRICTS) {
      expect(normalizedUnique.has(normalizeDistrict(d))).toBe(true);
      expect(getDistrictCluster(d)).not.toBeNull();
    }
  });

  test('normalizes district names with space and spelling variants', () => {
    expect(normalizeDistrict('Nuwara Eliya')).toBe('nuwaraeliya');
    expect(normalizeDistrict('NuwaraEliya')).toBe('nuwaraeliya');
    expect(normalizeDistrict('Monaragala')).toBe('moneragala');
    expect(normalizeDistrict('Moneragala')).toBe('moneragala');
    expect(normalizeDistrict('  Colombo  ')).toBe('colombo');
    expect(normalizeDistrict('')).toBe('');
    expect(normalizeDistrict(null)).toBe('');
  });

  test('evaluates risk tiers correctly according to epidemiological thresholds', () => {
    expect(getRiskTier(1200).id).toBe('critical');
    expect(getRiskTier(1200).color).toBe('#9B2C2C');

    expect(getRiskTier(600).id).toBe('high');
    expect(getRiskTier(600).color).toBe('#C53030');

    expect(getRiskTier(200).id).toBe('moderate');
    expect(getRiskTier(200).color).toBe('#DD6B20');

    expect(getRiskTier(50).id).toBe('low');
    expect(getRiskTier(50).color).toBe('#D69E2E');

    expect(getRiskTier(6).id).toBe('minimal');
    expect(getRiskTier(6).color).toBe('#319795');

    expect(getRiskTier(0).id).toBe('nodata');
    expect(getRiskTier(0).color).toBe('#334155');

    // Overridden by alert level
    expect(getRiskTier(50, 'Critical').id).toBe('critical');
    expect(getRiskTier(50, 'High').id).toBe('high');
  });

  test('detects active contagion cluster for Western Province with seeded multi-district surge', () => {
    const testData = [
      { district: 'Colombo', totalCases: 1212, topDisease: 'Dengue' },
      { district: 'Gampaha', totalCases: 1124, topDisease: 'Dengue' },
      { district: 'Kandy', totalCases: 1061, topDisease: 'Dengue' },
      { district: 'Kalutara', totalCases: 603, topDisease: 'Leptospirosis' },
      { district: 'Ratnapura', totalCases: 582, topDisease: 'Leptospirosis' },
      { district: 'Galle', totalCases: 185, topDisease: 'Diarrhoeal disease' }
    ];

    const result = computeRegionalClusters(testData);
    expect(result.clusters).toHaveLength(9);

    const western = result.clusters.find(c => c.id === 'western');
    expect(western).toBeDefined();
    expect(western.isContagionCluster).toBe(true);
    expect(western.highOrCriticalCount).toBe(3);
    expect(western.totalCases).toBe(1212 + 1124 + 603);
    expect(western.maxRiskTier.id).toBe('critical');

    expect(result.isDistrictInContagionCluster('Colombo')).toBe(true);
    expect(result.isDistrictInContagionCluster('Gampaha')).toBe(true);
    expect(result.isDistrictInContagionCluster('Kalutara')).toBe(true);
    expect(result.isDistrictInContagionCluster('Galle')).toBe(false);
  });

  test('evaluates cross-border adjacency between Ratnapura and neighboring districts', () => {
    const ratnapuraNeighbors = DISTRICT_ADJACENCY[normalizeDistrict('Ratnapura')];
    expect(ratnapuraNeighbors).toContain('kalutara');
    expect(ratnapuraNeighbors).toContain('colombo');

    // Single high-risk district in Sabaragamuwa (Ratnapura) adjacent to high-risk Kalutara triggers contagion alert
    const testData = [
      { district: 'Ratnapura', totalCases: 582, topDisease: 'Leptospirosis' },
      { district: 'Kalutara', totalCases: 603, topDisease: 'Leptospirosis' }
    ];

    const result = computeRegionalClusters(testData);
    const sabaragamuwa = result.clusters.find(c => c.id === 'sabaragamuwa');
    expect(sabaragamuwa.isContagionCluster).toBe(true);
  });

  test('handles empty data and undefined inputs gracefully', () => {
    const result = computeRegionalClusters([], []);
    expect(result.clusters).toHaveLength(9);
    for (const c of result.clusters) {
      expect(c.totalCases).toBe(0);
      expect(c.isContagionCluster).toBe(false);
      expect(c.maxRiskTier.id).toBe('nodata');
    }
    expect(result.isDistrictInContagionCluster('Colombo')).toBe(false);
  });
});
