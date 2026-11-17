import React, { useEffect, useState } from 'react';
import api from '../../api/axiosInstance';
import { useTranslation } from '../../i18n/LanguageContext';

// Fix pack 2, C4: top 5 diseases in one district over the last 30 days, from the existing public
// /public/health-stats endpoint (one aggregation, cached on the server). Counts are distinct verified cases
// (one per patient, disease and episode). Small-cell rule: below 5 shows "<5"; a district with fewer than 5
// verified cases in total is "Not disclosed (<5)". Aggregates only: no patient fields, no ids.
export function drilldownRows(stats) {
  const total = Number(stats?.totalCases) || 0;
  if (total < 5) return { disclosed: false, rows: [] };
  const rows = (Array.isArray(stats?.byDisease) ? stats.byDisease : [])
    .filter(r => r && typeof r.disease === 'string' && Number.isFinite(Number(r.totalCases)) && Number(r.totalCases) > 0)
    .sort((a, b) => Number(b.totalCases) - Number(a.totalCases) || a.disease.localeCompare(b.disease))
    .slice(0, 5)
    .map(r => ({ disease: r.disease, people: Number(r.totalCases) >= 5 ? Number(r.totalCases) : '<5' }));
  return { disclosed: true, rows };
}

export default function DistrictDrilldown({ district }) {
  const { t } = useTranslation();
  const [state, setState] = useState({ status: 'idle', data: null });

  useEffect(() => {
    if (!district) return undefined;
    const controller = new AbortController();
    setState({ status: 'loading', data: null });
    api.get('/public/health-stats', { params: { rangeDays: 30, district }, signal: controller.signal })
      .then(res => setState({ status: 'ok', data: drilldownRows(res.data?.data) }))
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'error', data: null }); });
    return () => controller.abort();
  }, [district]);

  if (!district) return null;
  return (
    <section data-testid="district-drilldown" aria-label={t('drilldown.title', 'Top diseases in the last 30 days')} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-2">
      <h3 className="text-sm font-semibold text-slate-100">{district}: {t('drilldown.title', 'Top diseases in the last 30 days')}</h3>
      {state.status === 'loading' && <p className="text-xs text-slate-400">{t('drilldown.loading', 'Loading…')}</p>}
      {state.status === 'error' && <p role="status" className="text-xs text-slate-400">{t('drilldown.unavailable', 'District figures are unavailable right now.')}</p>}
      {state.status === 'ok' && !state.data.disclosed && (
        <p data-testid="drilldown-not-disclosed" className="text-xs text-slate-300">{t('activity.notDisclosed', 'Not disclosed (<5)')}</p>
      )}
      {state.status === 'ok' && state.data.disclosed && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400">
              <th scope="col" className="text-left py-1">{t('drilldown.disease', 'Disease')}</th>
              <th scope="col" className="text-right py-1">{t('drilldown.people', 'People (verified)')}</th>
            </tr>
          </thead>
          <tbody>
            {state.data.rows.map(row => (
              <tr key={row.disease} className="border-t border-slate-800">
                <td className="py-1">{row.disease}</td>
                <td className="py-1 text-right" data-testid="drilldown-count">{row.people}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
