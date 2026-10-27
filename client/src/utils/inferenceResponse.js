// Validate the existing ML percentage-valued similarity contract before display. Never coerce/clamp.
export function inferencePredictions(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.predictions) ||
      payload.fallback === true || (payload.availability !== undefined && payload.availability !== 'available')) throw new Error('Unavailable inference');
  return payload.predictions.map(row => {
    if (!row || typeof row !== 'object' || typeof row.disease !== 'string' || !row.disease.trim() ||
        typeof row.confidence !== 'number' || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 100 ||
        (row.icd_code !== undefined && typeof row.icd_code !== 'string') ||
        (row.recommendedSpecialist !== undefined && typeof row.recommendedSpecialist !== 'string') ||
        (row.urgent !== undefined && typeof row.urgent !== 'boolean')) throw new Error('Invalid inference response');
    return Object.fromEntries(['disease','confidence','icd_code','recommendedSpecialist','urgent'].filter(key => row[key] !== undefined).map(key => [key,row[key]]));
  });
}
