import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { FiAlertTriangle, FiCheckCircle, FiInfo, FiShield } from 'react-icons/fi';
import api from '../../api/axiosInstance';

export default function MedicineSafetyPanel({
  medications = [],
  patientId = null,
  consultationNic,
  patientNic,
  consentToken,
  acknowledgment = { acknowledged: false, reason: '' },
  onAcknowledgmentChange,
  readOnly = false,
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [safetyData, setSafetyData] = useState(null);

  useEffect(() => {
    let active = true;
    if (!medications || medications.length === 0) {
      setSafetyData(null);
      setLoading(false);
      return;
    }

    // Immediately reset to prevent showing stale green check during loading
    setSafetyData(null);
    setLoading(true);

    const checkSafety = async () => {
      try {
        const res = consultationNic
          ? await api.post('/prescriptions/consultation-safety', {
              medications, patientNic: consultationNic,
            }, { headers: { 'x-patient-access': consentToken } })
          : await api.post('/prescriptions/check-safety', { medications, patientId, patientNic, acknowledgment },
              { headers: { 'x-patient-access': consentToken } });
        if (active) setSafetyData(res.data);
      } catch (err) {
        if (active) {
          setSafetyData({
            hasWarnings: false,
            warnings: [],
            error: 'Unable to check medicine safety offline',
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    const timer = setTimeout(checkSafety, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medications, patientId, patientNic, consultationNic, consentToken]);

  if (!medications || medications.length === 0) return null;

  const actionableWarnings = (safetyData?.warnings || []).filter(
    (w) => w.severity === 'high' || w.severity === 'moderate'
  );
  const infoNotices = (safetyData?.warnings || []).filter((w) => w.severity === 'info');
  const isIncomplete = Boolean(
    safetyData?.verificationIncomplete ||
    (safetyData?.warnings || []).some(
      (w) => w.type === 'incomplete_verification' || w.verificationIncomplete || (w.severity === 'info' && /incomplete/i.test(w.message || w.summary || ''))
    )
  );

  return (
    <div
      data-testid="medicine-safety-panel"
      className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 space-y-3.5 my-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FiShield className="w-5 h-5 text-teal-400" />
          <h4 className="font-bold text-white text-sm">
            {t('medicineSafety.title')}
          </h4>
        </div>
        <span
          data-testid="safety-clinical-validation"
          className="text-xs font-medium text-amber-300/90 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20"
        >
          Advisory reference. Clinical assessment required.
        </span>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        {t('medicineSafety.disclaimer')}
      </p>

      <div data-testid="medicine-safety-scope" className="text-xs text-teal-300/90 bg-teal-950/40 border border-teal-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
        <FiCheckCircle className="w-4 h-4 text-teal-400 shrink-0" />
        <span>Checks performed: DDI, duplicate ingredient, allergy, dose ceiling, duration limit</span>
      </div>

      {loading || !safetyData ? (
        <div className="py-2 text-xs text-slate-400 flex items-center gap-2 animate-pulse">
          <span>Checking drug interactions and formulary limits…</span>
        </div>
      ) : safetyData?.error ? (
        <p role="status" className="text-xs text-amber-300">{t('liveQa.unavailable', 'Unavailable')}</p>
      ) : actionableWarnings.length > 0 ? (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
            <FiAlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              {t('medicineSafety.interactionsDetected')} ({actionableWarnings.length})
            </span>
          </div>

          <div className="space-y-2">
            {actionableWarnings.map((w, idx) => (
              <div
                key={idx}
                data-testid={`safety-warning-${idx}`}
                className={`p-3 rounded-lg border text-xs leading-relaxed ${
                  w.severity === 'high'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                }`}
              >
                <div className="font-bold uppercase tracking-wider text-[11px] mb-1">
                  {w.severity === 'high' ? 'High Risk' : 'Moderate Advisory'} — {w.type}
                </div>
                <div>{w.message}</div>
              </div>
            ))}
          </div>

          {!readOnly && onAcknowledgmentChange && (
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300 font-medium">
                <input
                  type="checkbox"
                  data-testid="safety-ack-checkbox"
                  checked={acknowledgment?.acknowledged || false}
                  onChange={(e) =>
                    onAcknowledgmentChange({
                      ...acknowledgment,
                      acknowledged: e.target.checked,
                      findingsHash: safetyData?.findingsHash || null,
                    })
                  }
                  className="mt-0.5 rounded border-slate-700 bg-slate-950 text-teal-500 focus:ring-teal-400"
                />
                <span>{t('medicineSafety.acknowledgeCheckbox', 'I have reviewed these warnings and accept clinical responsibility.')}</span>
              </label>

              {acknowledgment?.acknowledged && (safetyData?.requiresReason ?? true) && (
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-400">
                    {t('medicineSafety.justificationReason', 'Clinical Justification Reason')}
                  </label>
                  <textarea
                    data-testid="safety-ack-reason"
                    rows={2}
                    maxLength={250}
                    value={acknowledgment?.reason || ''}
                    onChange={(e) =>
                      onAcknowledgmentChange({
                        ...acknowledgment,
                        reason: e.target.value,
                        findingsHash: safetyData?.findingsHash || null,
                      })
                    }
                    placeholder={t('medicineSafety.reasonPlaceholder', 'Enter clinical justification (min 5 chars)...')}
                    className="w-full text-xs rounded-lg border border-slate-700 bg-slate-950/80 p-2 text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none"
                  />
                  {(!acknowledgment?.reason || acknowledgment.reason.trim().length < 5) && (
                    <p className="text-xs text-amber-400">
                      Reason must be at least 5 characters to proceed (max 250).
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : isIncomplete ? (
        <div data-testid="safety-status-incomplete" className="flex items-center gap-2 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
          <FiInfo className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>{t('medicineSafety.checkIncomplete', 'Check incomplete, clinical assessment required.')}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-teal-300 py-1">
          <FiCheckCircle className="w-4 h-4 text-teal-400 flex-shrink-0" />
          <span>{t('medicineSafety.noInteractions')}</span>
        </div>
      )}

      {infoNotices.length > 0 && (
        <div className="pt-2 border-t border-slate-800/80 space-y-1">
          {infoNotices.map((n, idx) => (
            <div key={idx} className="flex items-center gap-1.5 text-xs text-slate-400">
              <FiInfo className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span>{n.message}</span>
            </div>
          ))}
        </div>
      )}

      {Array.isArray(safetyData?.supersededNotices) && safetyData.supersededNotices.length > 0 && (
        <div data-testid="supersession-notices" className="space-y-1.5 pt-2 border-t border-slate-800">
          {safetyData.supersededNotices.map((sn, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-200 text-xs flex items-center gap-2"
            >
              <FiInfo className="w-4 h-4 text-sky-400 shrink-0" />
              <span>{sn.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
