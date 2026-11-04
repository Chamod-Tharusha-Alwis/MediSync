import React, { useEffect, useState } from 'react';
import { MapContainer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import PublicNavbar from '../../components/common/PublicNavbar';
import PageTransition from '../../components/common/PageTransition';
import api from '../../api/axiosInstance';
import { useTranslation } from '../../i18n/LanguageContext';
import { ALL_DISTRICTS, normalizeDistrictName } from '../../utils/districtAdjacency';
import { validateConsultationActivity } from '../../utils/consultationActivity';

function ActivityMap({ data, onSelect, t }) {
  const [geometry, setGeometry] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/lk_districts.json', { signal: controller.signal, credentials: 'omit' })
      .then(response => { if (response.ok === false) throw Error(); return response.json(); })
      .then(value => { if (!controller.signal.aborted && value?.type === 'FeatureCollection') setGeometry(value); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const canonical = feature => ALL_DISTRICTS.find(name => normalizeDistrictName(name) === normalizeDistrictName(feature.properties?.NAME_1 || feature.properties?.name || feature.properties?.ADM1_EN));
  return <section aria-label={t('activity.map', 'District visit map')} className="min-w-0 space-y-3">
    <h2 className="text-lg font-semibold">{t('activity.map', 'District visit map')}</h2>
    <p className="text-sm text-slate-300">{t('activity.mapCaption', 'Blue identifies districts with disclosed visit counts. It is not a disease-risk level.')}</p>
    {geometry ? <div className="h-80 overflow-hidden rounded-xl border border-slate-600" data-testid="activity-map">
      <MapContainer center={[7.8731, 80.7718]} zoom={7} scrollWheelZoom={false} style={{ height: '100%', width: '100%', background: '#0f172a' }}>
        <GeoJSON key={JSON.stringify(data.byDistrict)} data={geometry} style={feature => ({ color: '#64748b', weight: 1, fillColor: data.byDistrict.some(row => row.district === canonical(feature)) ? '#60a5fa' : '#1e293b', fillOpacity: 0.55 })}
          onEachFeature={(feature, layer) => { const name = canonical(feature); if (name) layer.on({ click: () => onSelect(name) }); }} />
      </MapContainer>
    </div> : <p className="text-sm text-slate-300">{t('activity.mapFallback', 'The district table remains available if the map cannot load.')}</p>}
    <p className="text-sm text-slate-300">{t('activity.disclosure', 'District counts below 5 are not disclosed. Missing district counts must not be read as zero.')}</p>
  </section>;
}

export default function PublicHealth() {
  const { t, language = 'en' } = useTranslation();
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(null);
  const [filters, setFilters] = useState({ rangeDays: 30, district: 'all' }), [retry, setRetry] = useState(0), [selectedDistrict, setSelectedDistrict] = useState(null);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setLoading(true); setData(null); setError(null); setSelectedDistrict(null);
    api.get('/public/consultation-activity', { params: filters, signal: controller.signal })
      .then(response => { const result = validateConsultationActivity(response.data?.data, filters); if (active) setData(result); })
      .catch(failure => { if (active) { setData(null); setError(failure?.response?.status === 429 ? 'rateLimited' : 'unavailable'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [filters, retry]);
  const number = value => new Intl.NumberFormat(({ en: 'en-LK', si: 'si-LK', ta: 'ta-LK' })[language] || 'en-LK').format(value);
  const formatDay = value => new Intl.DateTimeFormat(({ en: 'en-LK', si: 'si-LK', ta: 'ta-LK' })[language] || 'en-LK', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(value + 'T00:00:00Z'));
  const select = district => setSelectedDistrict(district);
  const change = event => { setData(null); setSelectedDistrict(null); setFilters(previous => ({ ...previous, [event.target.name]: event.target.name === 'rangeDays' ? Number(event.target.value) : event.target.value })); };
  const selected = data?.byDistrict.find(row => row.district === selectedDistrict);
  const unavailable = t('activity.notAvailable', 'Not available');
  const visitCaption = t('activity.visitCaption', 'One visit is one saved consultation record, not a unique patient or a confirmed case.');
  return <div className="min-h-screen bg-slate-950 text-slate-100">
    <PublicNavbar />
    <PageTransition><main data-testid="public-activity-report" data-availability={loading ? 'loading' : error ? 'unavailable' : 'available'} className="mx-auto max-w-7xl px-4 pb-12 pt-48 xl:pt-28 sm:px-6 space-y-6 min-w-0">
      <header><h1 className="text-2xl sm:text-3xl font-bold break-words" data-testid="public-activity-heading">{t('activity.title', 'Recorded consultation visits')}</h1>
        {(!data || loading || error) && <p className="mt-2 text-slate-300" data-testid="activity-visit-caption">{visitCaption}</p>}</header>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">{t('activity.range', 'Time range')}<select name="rangeDays" aria-label={t('activity.range', 'Time range')} value={filters.rangeDays} onChange={change} className="min-h-[44px] rounded-lg border border-slate-500 bg-slate-900 px-3">
          {[7, 30, 90, 365].map(days => <option key={days} value={days}>{number(days)} {t('activity.days', 'days')}</option>)}</select></label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">{t('activity.district', 'District')}<select name="district" aria-label={t('activity.district', 'District')} value={filters.district} onChange={change} className="min-h-[44px] max-w-full rounded-lg border border-slate-500 bg-slate-900 px-3">
          <option value="all">{t('activity.allDistricts', 'All districts')}</option>{ALL_DISTRICTS.map(name => <option key={name}>{name}</option>)}</select></label>
      </div>
      {loading && <p role="status">{t('activity.loading', 'Loading recorded visits…')}</p>}
      {error && <div role="alert" className="rounded-xl border border-slate-500 bg-slate-900 p-4 space-y-3"><p>{error === 'rateLimited' ? t('activity.rateLimited', 'Too many requests. Please wait before trying again.') : t('activity.unavailable', 'Recorded visit statistics are temporarily unavailable. No visit counts are shown.')}</p>
        <button type="button" onClick={() => { setData(null); setSelectedDistrict(null); setRetry(value => value + 1); }} className="min-h-[44px] rounded-lg bg-slate-700 px-4 focus-visible:ring-2 focus-visible:ring-blue-300">{t('activity.retry', 'Retry')}</button></div>}
      {data && !loading && !error && <>
        <section className="rounded-xl border border-slate-600 bg-slate-900 p-5" aria-label={t('activity.total', 'Recorded visits')}><h2 className="text-slate-300">{t('activity.total', 'Recorded visits')}</h2><p className="text-4xl font-bold mt-2" data-testid="activity-total-visits">{data.disclosure.suppressed ? t('activity.notDisclosed', 'Not disclosed (<5)') : number(data.totalVisits)}</p><p className="mt-2 text-sm text-slate-300" data-testid="activity-visit-caption">{visitCaption}</p><p className="mt-2 text-sm text-slate-300">{t('activity.utc', 'Dates use UTC. Figures describe recorded activity, not population disease incidence.')}</p></section>
        {data.totalVisits === 0 && <p data-testid="activity-empty" className="rounded-xl border border-slate-600 p-4">{t('activity.zero', 'No recorded visits in the selected period and district.')}</p>}
        {(data.disclosure.suppressed || (data.totalVisits > 0 && data.byDistrict.length === 0)) && <p data-testid="activity-district-empty" className="rounded-xl border border-slate-600 p-4">{data.disclosure.suppressed ? t('activity.selectedSuppressed', 'The selected district’s total and daily counts are not disclosed below 5.') : t('activity.suppressed', 'Visit activity is recorded, but no district count meets the disclosure threshold. District details are not available.')}</p>}
        <div className="grid gap-6 lg:grid-cols-2 min-w-0">
          <ActivityMap data={data} onSelect={select} t={t} />
          <section className="min-w-0 space-y-3"><h2 className="text-lg font-semibold">{t('activity.daily', 'Recorded visits by UTC day')}</h2>{(data.disclosure.suppressed || data.disclosure.districtTrendUnavailable) ? <p>{data.disclosure.suppressed ? t('activity.selectedSuppressed', 'The selected district’s total and daily counts are not disclosed below 5.') : t('activity.districtDailyUnavailable', 'Daily counts are not published for district selections.')}</p> : <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-600"><table className="w-full text-sm"><caption className="sr-only">{t('activity.daily', 'Recorded visits by UTC day')}</caption><thead><tr><th scope="col" className="p-3 text-left">{t('activity.date', 'Date (UTC)')}</th><th scope="col" className="p-3 text-right">{t('activity.visits', 'Visits')}</th></tr></thead><tbody>{data.trend.map(row => <tr key={row.date} className="border-t border-slate-700"><th scope="row" className="p-3 text-left font-normal"><time dateTime={row.date}>{formatDay(row.date)}</time></th><td className="p-3 text-right">{number(row.visitCount)}</td></tr>)}</tbody></table></div>}</section>
        </div>
        <section className="space-y-3"><h2 className="text-lg font-semibold">{t('activity.districtTable', 'District visit counts')}</h2><div className="overflow-x-auto rounded-xl border border-slate-600"><table className="w-full table-fixed text-sm" aria-label={t('activity.districtTable', 'District visit counts')}><thead><tr><th scope="col" className="p-3 text-left">{t('activity.district', 'District')}</th><th scope="col" className="p-3 text-right">{t('activity.visits', 'Visits')}</th></tr></thead><tbody>{ALL_DISTRICTS.filter(name => filters.district === 'all' || filters.district === name).map(name => { const row = data.byDistrict.find(item => item.district === name); return <tr key={name} className="border-t border-slate-700"><th scope="row" className="p-2 text-left"><button type="button" onClick={() => select(name)} className="min-h-[44px] max-w-full whitespace-normal break-words px-1 text-blue-200 underline focus-visible:ring-2 focus-visible:ring-blue-300">{name}</button></th><td className="p-3 text-right whitespace-normal break-words">{row ? number(row.visitCount) : t('activity.notDisclosed', 'Not disclosed (<5)')}</td></tr>; })}</tbody></table></div>
        {selectedDistrict && <p data-testid="selected-district-card" className="rounded-lg border border-slate-500 p-4">{selectedDistrict}: {selected ? number(selected.visitCount) + ' ' + t('activity.visits', 'Visits') : t('activity.notDisclosed', 'Not disclosed (<5)')}</p>}</section>
      </>}
      <section aria-label={t('activity.surveillance', 'Clinical surveillance')} className="grid gap-3 sm:grid-cols-3">
        {[['confirmed-cases', 'activity.confirmed', 'Confirmed cases'], ['outbreak-clusters', 'activity.outbreaks', 'Outbreaks'], ['forecast', 'activity.forecast', 'Forecast']].map(([id, key, label]) => <div key={id} className="rounded-xl border border-slate-600 bg-slate-900 p-4"><h2 className="text-sm text-slate-300">{t(key, label)}</h2><p className="mt-2 font-semibold" data-testid={'surveillance-' + id + '-value'}>{unavailable}</p></div>)}
      </section>
    </main></PageTransition>
  </div>;
}
