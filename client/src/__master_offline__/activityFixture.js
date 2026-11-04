export function activityFixture(totalVisits = 6, options = {}) {
  const rangeDays = options.rangeDays || 30;
  const end = new Date('2026-11-04T12:00:00.000Z');
  const start = new Date(Date.UTC(2026, 10, 4) - (rangeDays - 1) * 86400000);
  return {
    metric: 'recorded_consultation_visits', source: 'mongodb', mode: 'real', unit: 'visits',
    period: { start: start.toISOString(), end: end.toISOString(), rangeDays }, totalVisits,
    byDistrict: options.byDistrict || (totalVisits >= 5 ? [{ district: 'Colombo', visitCount: totalVisits }] : []),
    trend: Array.from({ length: rangeDays }, (_, index) => ({ date: new Date(+start + index * 86400000).toISOString().slice(0, 10), visitCount: index === rangeDays - 1 ? totalVisits : 0 })),
    disclosure: { districtMinCount: 5 },
    surveillance: { availability: 'not_available', confirmedCases: null, outbreakClusters: null, forecast: null }
  };
}
