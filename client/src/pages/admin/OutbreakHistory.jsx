import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/axiosInstance';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatSriLankaDateTime } from '../../utils/sriLankaTime';
import { formatDistrictName } from '../../utils/districtAdjacency';
import { formatFriendlyDisease } from '../../utils/localizedMessage';
import { AlertNumbers72h } from '../../components/admin/AlertNumbers72h';

// Outbreak History: read-only list of alerts that left the Outbreak Monitor (resolved or dismissed, or older than
// 14 days). Served by GET /admin/outbreak/alerts?view=history; the 14-day rule lives in server/src/services/outbreakViews.js.
export const DISTRICTS = ['Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle',
  'Kilinochchi', 'Kurunegala', 'Mannar', 'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya', 'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya'];
export const STATUSES = ['Resolved', 'Dismissed', 'Pending', 'Active'];

export function historyQuery(filters, page) {
  const p = new URLSearchParams({ view: 'history', page: String(page) });
  for (const key of ['disease', 'district', 'status', 'from', 'to']) if (filters[key]) p.set(key, filters[key]);
  return `/admin/outbreak/alerts?${p.toString()}`;
}

const EMPTY = { disease: '', district: '', status: '', from: '', to: '' };

export default function OutbreakHistory() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ status: 'loading', rows: [], paging: null, error: null });

  const load = useCallback(async () => {
    setState(s => ({ ...s, status: 'loading', error: null }));
    try {
      const res = await api.get(historyQuery(filters, page));
      setState({ status: 'ok', rows: Array.isArray(res.data?.data) ? res.data.data : [], paging: res.data?.pagination || null, error: null });
    } catch (err) {
      setState({ status: 'error', rows: [], paging: null, error: err.response?.data?.error || null });
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const apply = e => { e.preventDefault(); setPage(1); setFilters({ ...draft, disease: draft.disease.trim() }); };
  const clear = () => { setDraft(EMPTY); setFilters(EMPTY); setPage(1); };
  const field = (key, extra = {}) => ({ id: `history-${key}`, value: draft[key], onChange: e => setDraft(d => ({ ...d, [key]: e.target.value })), ...extra });
  const statusLabel = s => t(`outbreakHistory.status.${s}`, s);
  const inputClass = 'glass-input text-sm py-2';

  return (
    <div className="space-y-6" data-testid="outbreak-history">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('outbreakHistory.title', 'Outbreak History')}</h1>
        <p className="text-sm text-slate-400 mt-1">{t('outbreakHistory.subtitle', 'Alerts that were resolved or dismissed, and any alert older than 14 days. Read-only; nothing is deleted.')}</p>
      </div>

      <form onSubmit={apply} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end p-4 rounded-2xl bg-slate-900/60 border border-white/5" aria-label={t('outbreakHistory.filters', 'Filters')}>
        <label className="text-xs text-slate-400 space-y-1 lg:col-span-2">
          <span className="block">{t('outbreakHistory.disease', 'Disease (ICD code)')}</span>
          <input type="text" maxLength={64} className={inputClass} {...field('disease')} />
        </label>
        <label className="text-xs text-slate-400 space-y-1">
          <span className="block">{t('outbreakHistory.district', 'District')}</span>
          <select className={inputClass} {...field('district')}>
            <option value="">{t('outbreakHistory.all', 'All')}</option>
            {DISTRICTS.map(d => <option key={d} value={d}>{formatDistrictName(d) || d}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400 space-y-1">
          <span className="block">{t('outbreakHistory.statusLabel', 'Final status')}</span>
          <select className={inputClass} {...field('status')}>
            <option value="">{t('outbreakHistory.all', 'All')}</option>
            {STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400 space-y-1">
          <span className="block">{t('outbreakHistory.from', 'From')}</span>
          <input type="date" className={inputClass} {...field('from')} />
        </label>
        <label className="text-xs text-slate-400 space-y-1">
          <span className="block">{t('outbreakHistory.to', 'To')}</span>
          <input type="date" className={inputClass} {...field('to')} />
        </label>
        <div className="flex gap-2 lg:col-span-6">
          <button type="submit" className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold">{t('outbreakHistory.apply', 'Apply filters')}</button>
          <button type="button" onClick={clear} className="px-4 py-2 rounded-lg border border-white/10 text-slate-300 text-sm">{t('outbreakHistory.clear', 'Clear')}</button>
        </div>
      </form>

      <div className="rounded-2xl bg-slate-900/60 border border-white/5 overflow-hidden">
        {state.status === 'loading' && (
          <div className="p-4 space-y-3" data-testid="history-loading" aria-busy="true">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-10 rounded bg-slate-800/70 animate-pulse" />)}
          </div>
        )}
        {state.status === 'error' && (
          <div role="alert" className="p-8 text-center text-sm text-red-300" data-testid="history-error">
            {t('outbreakHistory.error', 'Outbreak history could not be loaded.')}{' '}
            <button type="button" onClick={load} className="underline text-red-200">{t('outbreakHistory.retry', 'Retry')}</button>
          </div>
        )}
        {state.status === 'ok' && state.rows.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-sm" data-testid="history-empty">{t('outbreakHistory.empty', 'No past outbreaks yet')}</div>
        )}
        {state.status === 'ok' && state.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-slate-950/40 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">{t('outbreakHistory.colDisease', 'Disease vector')}</th>
                  <th className="px-4 py-3">{t('outbreakHistory.colLocation', 'Location')}</th>
                  <th className="px-4 py-3">{t('outbreakHistory.col72h', 'Previous / actual / projected 72 h')}</th>
                  <th className="px-4 py-3">{t('outbreakHistory.colSeverity', 'Severity')}</th>
                  <th className="px-4 py-3">{t('outbreakHistory.colStatus', 'Final status')}</th>
                  <th className="px-4 py-3">{t('outbreakHistory.colClosed', 'Closed (last update)')}</th>
                  <th className="px-4 py-3 text-right">{t('outbreakHistory.colTimestamp', 'Detected')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200" data-testid="history-rows">
                {state.rows.map(alert => (
                  <tr key={alert._id}>
                    <td className="px-4 py-3 font-semibold">{formatFriendlyDisease ? formatFriendlyDisease(alert.disease) || alert.disease : alert.disease}</td>
                    <td className="px-4 py-3">{formatDistrictName(alert.location || alert.district) || alert.location || alert.district || '—'}</td>
                    <td className="px-4 py-3">
                      {alert.alert72h ? <AlertNumbers72h view={alert.alert72h} /> : <span className="text-xs text-slate-500">{t('outbreakHistory.no72h', 'Not available (no 72-hour snapshot was stored)')}</span>}
                    </td>
                    <td className="px-4 py-3">{alert.severity || '—'}</td>
                    <td className="px-4 py-3">
                      {statusLabel(alert.status)}
                      {alert.historyReason === 'older_than_14_days' && <div className="text-xs text-slate-500">{t('outbreakHistory.aged', 'Older than 14 days')}</div>}
                    </td>
                    <td className="px-4 py-3">{alert.closedAt ? formatSriLankaDateTime(alert.closedAt) : '—'}</td>
                    <td className="px-4 py-3 text-right">{alert.createdAt ? formatSriLankaDateTime(alert.createdAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {state.status === 'ok' && state.paging && state.paging.total > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-white/5 text-xs text-slate-400" data-testid="history-paging">
            <span>{t('outbreakHistory.total', '{total} alerts').replace('{total}', state.paging.total)}</span>
            <span className="inline-flex items-center gap-2">
              <button type="button" className="px-2 py-1 rounded border border-white/10 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('outbreakHistory.previous', 'Previous')}</button>
              <span>{t('outbreakHistory.pageOf', 'Page {page} of {pages}').replace('{page}', state.paging.page).replace('{pages}', state.paging.pages)}</span>
              <button type="button" className="px-2 py-1 rounded border border-white/10 disabled:opacity-40" disabled={page >= state.paging.pages} onClick={() => setPage(p => p + 1)}>{t('outbreakHistory.next', 'Next')}</button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
