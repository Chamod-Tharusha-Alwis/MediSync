import React from 'react';
import { Info } from 'lucide-react';

// Alert 72-hour numbers for the admin outbreak monitor. Every value comes from the server's alert72h view
// (server/src/services/alertProjection72h.js), computed from verified consultations; nothing is computed or
// invented here.

export const SYNTHETIC_ALERT_SENTENCE = 'Demonstration alert generated from synthetic seed data. Not an active public health notice.';

// Badge only when the alert's source consultations carry a synthetic seed batch tag (set by the scan from
// the consultations themselves). Real alerts carry no batch tag and show no badge.
export function isSyntheticSeedAlert(alert) {
  return Boolean(alert && typeof alert.syntheticSeedBatch === 'string' && alert.syntheticSeedBatch.trim());
}

export function SyntheticDemoBadge() {
  return (
    <span
      data-testid="synthetic-demo-badge"
      title={SYNTHETIC_ALERT_SENTENCE}
      className="inline-block mt-0.5 px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-[10px] font-bold tracking-wider text-amber-400 whitespace-nowrap"
    >
      SYNTHETIC DEMO DATA
    </span>
  );
}

const fmtRange = v => (v && v.enoughHistory && v.low !== null && v.high !== null ? `range ${v.low}–${v.high}` : 'not enough history');

export function ProjectionHelp({ view }) {
  return (
    <span className="relative inline-flex group align-middle" data-testid="projection-help">
      <Info className="w-3 h-3 text-slate-500 cursor-help" aria-label="How the projection was made" tabIndex={0} />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-4 top-0 z-20 hidden w-64 rounded-lg border border-white/10 bg-slate-950 p-2 text-[11px] font-normal leading-snug text-slate-300 shadow-lg group-hover:block group-focus-within:block"
      >
        {view?.helpText || 'Projection method unavailable.'}
      </span>
    </span>
  );
}

export function AlertNumbers72h({ view }) {
  if (!view) return null;
  const o = view.outcome;
  return (
    <div className="space-y-0.5 font-mono" data-testid="alert-72h-numbers">
      <div className="text-xs text-slate-400">Previous 72 hours: <span className="text-slate-200 font-bold" data-testid="n-previous">{view.previous72h ?? 'N/A'}</span></div>
      <div className="text-xs text-slate-400">Actual last 72 hours: <span className="text-white font-bold" data-testid="n-actual">{view.actual72h ?? 'N/A'}</span></div>
      <div className="text-xs text-slate-400 flex items-center gap-1">
        <span>Projected next 72 hours: <span className="text-sky-300 font-bold" data-testid="n-projected">{view.projected ?? 'N/A'}</span> <span className="text-slate-500" data-testid="n-range">({fmtRange(view)})</span></span>
        <ProjectionHelp view={view} />
      </div>
      <div className="text-[10px] italic text-slate-500">{view.caveat || 'projection, not a forecast'}</div>
      {o && (
        <div className="text-xs text-emerald-300" data-testid="n-outcome">
          Actual next 72 hours: <span className="font-bold">{o.actualNext72h}</span> (error {o.absoluteError}{o.withinRange === null ? '' : o.withinRange ? ', inside range' : ', outside range'})
        </div>
      )}
    </div>
  );
}

const fmtDate = d => (d ? new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'N/A');

export function AlertDetail72h({ alert }) {
  const v = alert?.alert72h;
  const w = v?.window;
  return (
    <div className="p-4 bg-slate-950/50 border-t border-white/5 space-y-3 text-xs text-slate-300" data-testid="alert-detail">
      {(isSyntheticSeedAlert(alert) || alert?.syntheticLabel) && (
        <div className="p-2 rounded-lg border border-amber-500/40 bg-amber-950/30 text-amber-300 font-semibold uppercase tracking-wide" data-testid="alert-detail-synthetic-sentence">
          {alert.syntheticLabel || SYNTHETIC_ALERT_SENTENCE}
        </div>
      )}
      {v ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-slate-900/70 border border-white/5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Previous 72 hours</div>
            <div className="text-2xl font-bold text-slate-100" data-testid="d-previous">{v.previous72h}</div>
            <div className="text-[10px] text-slate-500">{w ? `${fmtDate(w.previousStart)} – ${fmtDate(w.previousEnd)}` : ''}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/70 border border-white/5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Actual last 72 hours</div>
            <div className="text-2xl font-bold text-white" data-testid="d-actual">{v.actual72h}</div>
            <div className="text-[10px] text-slate-500">{w ? `${fmtDate(w.actualStart)} – ${fmtDate(w.actualEnd)} (ends at the last complete day)` : ''}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/70 border border-sky-500/20">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">Projected next 72 hours <ProjectionHelp view={v} /></div>
            <div className="text-2xl font-bold text-sky-300" data-testid="d-projected">{v.projected}</div>
            <div className="text-[10px] text-slate-400">{fmtRange(v)} · {v.caveat}</div>
            {v.outcome ? (
              <div className="mt-1 text-[11px] text-emerald-300" data-testid="d-outcome">Actual next 72 hours: <b>{v.outcome.actualNext72h}</b> · absolute error {v.outcome.absoluteError}</div>
            ) : (
              <div className="mt-1 text-[10px] text-slate-500">Actual next 72 hours appears after a scan covers {w ? `${fmtDate(w.nextStart)} – ${fmtDate(w.nextEnd)}` : 'that period'}.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-slate-500">72-hour numbers are not available for this alert.</div>
      )}
      <div className="text-[10px] text-slate-500">
        Counts: {v?.dataNote || 'verified MediSync consultations only (lower bound)'}. Method {v?.methodVersion || 'n/a'}; {v?.historyWindows ?? 0} past 72-hour windows; snapshot {v?.stored ? 'stored at scan time' : 'computed live (alert predates snapshots)'}.
      </div>
    </div>
  );
}
