'use strict';
const mongoose = require('mongoose');
const Consultation = require('../models/Consultation');
const { getCache, setCache } = require('../config/redis');
const { CACHE_POLICY, validateActivityFilters, activityDto, loadConsultationActivity } = require('../services/publicConsultationActivity');

exports.getConsultationActivity = async (req, res) => {
  let stage = 'FILTER_VALIDATION';
  try {
    let filters;
    try {
      const query = req.query || {};
      if (Object.keys(query).some(key => !['rangeDays', 'district'].includes(key))) throw Error();
      const range = query.rangeDays;
      if (range !== undefined && (typeof range !== 'string' || !/^[1-9][0-9]{0,2}$/.test(range))) throw Error();
      filters = validateActivityFilters({ rangeDays: range === undefined ? 30 : Number(range), district: query.district === undefined ? 'all' : query.district });
    } catch (_) { return res.status(400).json({ error: 'INVALID_ACTIVITY_FILTER' }); }
    stage = 'CONNECTION_GATE';
    if (mongoose.connection?.readyState !== 1) throw Error();
    const now = new Date(), day = now.toISOString().slice(0, 10);
    const cacheKey = `medisync:cache:consultation-activity:real-v1:${encodeURIComponent(JSON.stringify([day, filters.rangeDays, filters.district]))}`;
    let cached;
    try { cached = await getCache(cacheKey); }
    catch (_) { console.warn('[PublicConsultationActivity] stage=CACHE_READ category=OPTIONAL_CACHE_UNAVAILABLE'); }
    let cachedDto;
    if (cached?.policy === CACHE_POLICY && cached.mode === 'real' && cached.district === filters.district) {
      try {
        const dto = activityDto(cached.data);
        const expectedStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (filters.rangeDays - 1) * 86400000).toISOString();
        if (dto.period.rangeDays !== filters.rangeDays || dto.period.start !== expectedStart || dto.period.end.slice(0, 10) !== day || +new Date(dto.period.end) > +now ||
          (filters.district === 'all' && (dto.disclosure.suppressed === true || dto.disclosure.districtTrendUnavailable === true)) ||
          (filters.district !== 'all' && dto.disclosure.suppressed !== true && dto.totalVisits < 5) ||
          (filters.district !== 'all' && dto.disclosure.suppressed !== true && dto.disclosure.districtTrendUnavailable !== true) ||
          (filters.district !== 'all' && dto.byDistrict.some(row => row.district !== filters.district))) throw Error();
        cachedDto = dto;
      } catch (_) { console.warn('[PublicConsultationActivity] stage=CACHE_DECODE category=OPTIONAL_CACHE_INVALID'); }
    }
    if (cachedDto) return res.json({ data: cachedDto, cached: true });
    stage = 'SOURCE_READ';
    const data = await loadConsultationActivity(Consultation.collection, { connection: mongoose.connection, ...filters, now });
    try { await setCache(cacheKey, { policy: CACHE_POLICY, mode: 'real', district: filters.district, data }, 300); }
    catch (_) { console.warn('[PublicConsultationActivity] stage=CACHE_WRITE category=OPTIONAL_CACHE_UNAVAILABLE'); }
    return res.json({ data, cached: false });
  } catch (_) {
    console.error(`[PublicConsultationActivity] stage=${stage} category=ACTIVITY_UNAVAILABLE`);
    return res.status(503).json({ error: 'CONSULTATION_ACTIVITY_UNAVAILABLE', data: null });
  }
};
