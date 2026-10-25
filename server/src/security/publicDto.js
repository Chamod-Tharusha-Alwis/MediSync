'use strict';
// Construct response objects; query projection alone is not a privacy boundary.
const isSyntheticRecord = row => ['isSynthetic','isDemoData','isDemoAccount'].some(key => row?.[key] === true) || row?.datasetVersion === 'MEDISYNC_UNIV_DEMO_V2';
const text = value => typeof value === 'string' ? value : '';
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const publicId = value => typeof value === 'string' ? value : value && typeof value.toHexString === 'function' ? value.toHexString() : '';
function reviewDto(row = {}) {
  return { _id: publicId(row._id), rating: number(row.rating), comment: text(row.comment), createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : text(row.createdAt) };
}
function directoryDto(kind, row = {}) {
  const result = { _id: publicId(row._id), profilePicture: text(row.profilePicture), description: text(row.description), googleMapsUrl: text(row.googleMapsUrl), averageRating: number(row.averageRating), ratingCount: number(row.ratingCount) };
  if (kind === 'doctor') {
    Object.assign(result, { fullName: text(row.fullName), specialization: text(row.specialization) || 'General Practice', clinicAddress: text(row.clinicAddress), hospitals: Array.isArray(row.hospitals) ? row.hospitals.filter(h => h && typeof h === 'object' && !isSyntheticRecord(h)).map(h => ({ name: text(h.name), district: text(h.district), address: text(h.address) })) : [], recentReviews: Array.isArray(row.recentReviews) ? row.recentReviews.map(reviewDto) : [] });
  } else {
    Object.assign(result, { name: text(row.name), district: text(row.district), address: text(row.address), pickupLocationAddress: text(row.pickupLocationAddress) });
    if (kind === 'hospital') Object.assign(result, { type: text(row.type), emergencyHotline: text(row.emergencyHotline), website: text(row.website) });
  }
  if (row.isSynthetic === true || row.isDemoData === true) Object.assign(result, { isSynthetic: true, syntheticLabel: 'Synthetic University Demo Profile — Not a verified clinical service' });
  return result;
}
function profileDto(row) {
  return { profilePicture: text(row?.profilePicture), description: text(row?.description), googleMapsUrl: text(row?.googleMapsUrl), pickupLocationAddress: text(row?.pickupLocationAddress) };
}
function healthDto(row) {
  const count = value => { if (!Number.isSafeInteger(value) || value < 0) throw Error('INVALID_AGGREGATE'); return value; };
  const label = value => { if (typeof value !== 'string' || value.length > 120) throw Error('INVALID_AGGREGATE'); return value; };
  const list = (value, project) => { if (!Array.isArray(value) || value.length > 1000) throw Error('INVALID_AGGREGATE'); return value.map(project); };
  return { totalCases: count(row?.totalCases), byDistrict: list(row.byDistrict, r => ({district:label(r.district),totalCases:count(r.totalCases),topDisease:label(r.topDisease || 'Unknown')})), byDisease:list(row.byDisease,r=>({disease:label(r.disease),totalCases:count(r.totalCases)})), trend:list(row.trend,r=>({date:label(r.date),count:count(r.count)})) };
}
function assertMlOrigin(raw, environment) {
  const endpoint = new URL(raw);
  const local = environment.NODE_ENV !== 'production' && endpoint.hostname === '127.0.0.1' && endpoint.protocol === 'http:';
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/' || (!local && (endpoint.protocol !== 'https:' || endpoint.origin !== environment.MEDISYNC_ML_ALLOWED_ORIGIN))) throw Error('ML_ENDPOINT_DENIED');
  return endpoint.origin;
}
function isHttpsLink(raw) { try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password; } catch (_) { return false; } }
module.exports = { isSyntheticRecord, directoryDto, reviewDto, profileDto, healthDto, assertMlOrigin, isHttpsLink };
