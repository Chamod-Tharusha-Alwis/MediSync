import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatSriLankaDateTime } from '../../utils/sriLankaTime';

// First detected / last updated / update timeline of an outbreak alert (read-only). Every value is what the server stored
// when a scan updated the alert (server/src/services/alertUpsert.js). A missing value is shown as a dash, never invented.
const DASH = '—';
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const show = v => (v === null || v === undefined || v === '' ? DASH : String(v));
const when = v => (v ? formatSriLankaDateTime(v) : DASH);
const historyOf = alert => (Array.isArray(alert?.updateHistory) ? alert.updateHistory.filter(Boolean) : []);

export const firstDetectedText = alert => when(alert?.firstDetectedAt || alert?.createdAt);

export function LastUpdatedCell({ alert }) {
  const { t } = useTranslation();
  const updates = num(alert?.updateCount);
  const entries = historyOf(alert);
  const last = entries[entries.length - 1];
  const before = num(last?.caseCountBefore), after = num(last?.caseCountAfter);
  const added = before !== null && after !== null && after > before ? after - before : null;
  return (
    <div data-testid="alert-last-updated">
      <div>{when(alert?.lastUpdatedAt)}</div>
      {updates > 0 && <div className="text-slate-400">{t(updates === 1 ? 'alertUpdates.updatedOnce' : 'alertUpdates.updatedTimes', updates === 1 ? 'Updated 1 time' : 'Updated {n} times').replace('{n}', updates)}</div>}
      {added !== null && <div className="text-amber-300 font-semibold" data-testid="alert-added">{t('alertUpdates.added', '+{n} cases since last scan').replace('{n}', added)}</div>}
    </div>
  );
}

export function AlertTimeline({ alert }) {
  const { t } = useTranslation();
  const entries = historyOf(alert);
  const first = alert?.alert72hFirst;
  const sourceText = e => (e.triggeredBy === 'admin_manual' ? t('alertUpdates.byAdmin', 'Scan started by an administrator') : e.triggeredBy === 'scheduled' ? t('alertUpdates.byScheduled', 'Scheduled scan') : e.triggeredBy === 'service' ? t('alertUpdates.byService', 'Scan requested by a service') : DASH);
  return (
    <div className="p-4 bg-slate-950/50 border-t border-white/5 space-y-3 text-xs text-slate-300" data-testid="alert-timeline">
      <h4 className="text-xs uppercase tracking-wider text-slate-500 font-bold">{t('alertUpdates.timeline', 'Update history')}</h4>
      {entries.length === 0 && <p className="text-slate-500" data-testid="alert-timeline-empty">{t('alertUpdates.none', 'No updates since first detection.')}</p>}
      <ol className="space-y-2 border-l border-white/10 pl-4">
        {[...entries].reverse().map((e, i) => (
          <li key={`${e.at || 'x'}-${i}`} data-testid="alert-timeline-entry">
            <div className="font-semibold text-slate-200">{when(e.at)}</div>
            <div>{t('alertUpdates.cases', 'Cases in 7 days')}: {show(e.caseCountBefore)} → {show(e.caseCountAfter)}</div>
            <div>{t('alertUpdates.severity', 'Severity')}: {show(e.severityBefore)} → {show(e.severityAfter)}</div>
            <div>
              {t('alertUpdates.actual72h', 'Actual last 72 hours')}: {show(e.actual72hBefore)} → {show(e.actual72h)} · {t('alertUpdates.projected72h', 'Projected next 72 hours')}: {show(e.projected72h)}{' '}
              <span className="italic text-slate-500">({t('alertUpdates.caveat', 'projection, not a forecast')})</span>
            </div>
            <div className="text-slate-500">{sourceText(e)}</div>
            {e.note === 'WINDOW_RESULT_LOWER' && <div className="text-slate-400">{t('alertUpdates.lower', 'The 7-day window result was lower; the displayed count was kept at {n}.').replace('{n}', show(e.displayedCaseCount))}</div>}
          </li>
        ))}
        <li data-testid="alert-timeline-first">
          <div className="font-semibold text-slate-200">{firstDetectedText(alert)}</div>
          <div>{t('alertUpdates.firstDetected', 'First detected')}</div>
          {first && (
            <div>
              {t('alertUpdates.actual72h', 'Actual last 72 hours')}: {show(first.actual72h)} · {t('alertUpdates.projected72h', 'Projected next 72 hours')}: {show(first.projected)}{' '}
              <span className="italic text-slate-500">({t('alertUpdates.caveat', 'projection, not a forecast')})</span>
              {first.outcome && <> · {t('alertUpdates.outcome', 'Actual next 72 hours')}: {show(first.outcome.actualNext72h)}</>}
            </div>
          )}
        </li>
      </ol>
    </div>
  );
}
