import {
  formatDistrictName,
  ALL_DISTRICTS,
  normalizeDistrictName
} from '../utils/districtAdjacency';

describe('Item U19: District Display Formatter & Map Resolution Suite', () => {
  const ALL_25_DISTRICT_PAIRS = [
    { input: 'ampara', expected: 'Ampara' },
    { input: 'anuradhapura', expected: 'Anuradhapura' },
    { input: 'badulla', expected: 'Badulla' },
    { input: 'batticaloa', expected: 'Batticaloa' },
    { input: 'colombo', expected: 'Colombo' },
    { input: 'galle', expected: 'Galle' },
    { input: 'gampaha', expected: 'Gampaha' },
    { input: 'hambantota', expected: 'Hambantota' },
    { input: 'jaffna', expected: 'Jaffna' },
    { input: 'kalutara', expected: 'Kalutara' },
    { input: 'kandy', expected: 'Kandy' },
    { input: 'kegalle', expected: 'Kegalle' },
    { input: 'kilinochchi', expected: 'Kilinochchi' },
    { input: 'kurunegala', expected: 'Kurunegala' },
    { input: 'mannar', expected: 'Mannar' },
    { input: 'matale', expected: 'Matale' },
    { input: 'matara', expected: 'Matara' },
    { input: 'monaragala', expected: 'Monaragala' },
    { input: 'mullaitivu', expected: 'Mullaitivu' },
    { input: 'nuwara_eliya', expected: 'Nuwara Eliya' },
    { input: 'polonnaruwa', expected: 'Polonnaruwa' },
    { input: 'puttalam', expected: 'Puttalam' },
    { input: 'ratnapura', expected: 'Ratnapura' },
    { input: 'trincomalee', expected: 'Trincomalee' },
    { input: 'vavuniya', expected: 'Vavuniya' }
  ];

  test('verifies coverage of ALL 25 canonical districts', () => {
    expect(ALL_DISTRICTS).toHaveLength(25);
    expect(ALL_25_DISTRICT_PAIRS).toHaveLength(25);

    ALL_25_DISTRICT_PAIRS.forEach(({ input, expected }) => {
      expect(formatDistrictName(input)).toBe(expected);
    });
  });

  test('converts snake_case, kebab-case, and compacted district names to canonical display names', () => {
    expect(formatDistrictName('nuwara_eliya')).toBe('Nuwara Eliya');
    expect(formatDistrictName('nuwara-eliya')).toBe('Nuwara Eliya');
    expect(formatDistrictName('nuwaraeliya')).toBe('Nuwara Eliya');
    expect(formatDistrictName('moneragala')).toBe('Monaragala');
    expect(formatDistrictName('monaragala')).toBe('Monaragala');
  });

  test('handles uppercase, mixed case, and already canonical inputs', () => {
    expect(formatDistrictName('COLOMBO')).toBe('Colombo');
    expect(formatDistrictName('KaNdY')).toBe('Kandy');
    expect(formatDistrictName('Nuwara Eliya')).toBe('Nuwara Eliya');
    expect(formatDistrictName('Monaragala')).toBe('Monaragala');
  });

  test('handles edge cases (empty string, null, undefined, non-string, unlisted names)', () => {
    expect(formatDistrictName('')).toBe('');
    expect(formatDistrictName(null)).toBe('');
    expect(formatDistrictName(undefined)).toBe('');
    expect(formatDistrictName(123)).toBe('');
    expect(formatDistrictName({})).toBe('');
    expect(formatDistrictName('unknown_region')).toBe('Unknown Region');
  });

  test('preserves storage and query values without mutation', () => {
    const rawStorageRecord = { district: 'nuwara_eliya', count: 42 };
    const queryParams = { district: 'kandy' };

    const displayDistrict = formatDistrictName(rawStorageRecord.district);
    expect(displayDistrict).toBe('Nuwara Eliya');
    // Invariant: underlying storage record must NOT be mutated
    expect(rawStorageRecord.district).toBe('nuwara_eliya');

    const displayQuery = formatDistrictName(queryParams.district);
    expect(displayQuery).toBe('Kandy');
    // Invariant: underlying query parameters must NOT be mutated
    expect(queryParams.district).toBe('kandy');
  });

  test('ensures formatDistrictName output resolves in geographic coordinates dictionary', () => {
    // Representative subset of coordinates used in GeographicMap
    const sampleCoords = {
      'Colombo': [6.9271, 79.8612],
      'Kandy': [7.2906, 80.6337],
      'Nuwara Eliya': [6.9497, 80.7839],
      'Monaragala': [6.8728, 81.3507],
      'Nationwide': [7.8731, 80.7718]
    };

    const rawDistrict1 = 'nuwara_eliya';
    const rawDistrict2 = 'kandy';
    const rawDistrict3 = 'moneragala';

    // Before fix: sampleCoords[rawDistrict1] was undefined and fell back to Nationwide
    expect(sampleCoords[rawDistrict1]).toBeUndefined();

    // With formatDistrictName: coordinates lookup succeeds directly
    const formatted1 = formatDistrictName(rawDistrict1);
    expect(sampleCoords[formatted1]).toEqual([6.9497, 80.7839]);

    const formatted2 = formatDistrictName(rawDistrict2);
    expect(sampleCoords[formatted2]).toEqual([7.2906, 80.6337]);

    const formatted3 = formatDistrictName(rawDistrict3);
    expect(sampleCoords[formatted3]).toEqual([6.8728, 81.3507]);
  });
});
