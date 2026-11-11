import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import api from '../../api/axiosInstance';

const emptyFilters = { district: '', disease: '', startDate: '', endDate: '' };

export default function SurveillanceReviewQueue() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [reference, setReference] = useState('');
  const [state, setState] = useState('loading');
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    setRows([]);
    setSelected([]);
    api.get('/admin/surveillance/pending', {
      params: { ...filters, limit: 100 }, signal: controller.signal,
    }).then(({ data }) => {
      if (controller.signal.aborted) return;
      setRows(Array.isArray(data?.data) ? data.data : []);
      setState('ready');
    }).catch(() => {
      if (!controller.signal.aborted) setState('loadFailed');
    });
    return () => controller.abort();
  }, [filters, version]);

  async function review(status) {
    if (saving || !selected.length || (status === 'verified' && !reference.trim())) return;
    setSaving(true);
    try {
      await api.put('/admin/surveillance/bulk/review', {
        ids: selected, status,
        ...(status === 'verified' ? {
          diagnosisStatus: 'confirmed', caseDefinitionReference: reference.trim(),
        } : {}),
      });
      setVersion(value => value + 1);
    } catch (_) {
      setState('reviewFailed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="glass-card rounded-xl p-5 space-y-4" aria-labelledby="surveillance-review-heading">
      <h2 id="surveillance-review-heading" className="text-lg font-semibold">{t('liveQa.reviewTitle')}</h2>
      <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setFilters({ ...draft }); }}>
        {Object.keys(emptyFilters).map(field => (
          <label key={field} className="text-sm">
            {t(`liveQa.${field}`)}
            <input className="glass-input block" value={draft[field]} maxLength={80}
              type={field.endsWith('Date') ? 'date' : 'text'} disabled={saving}
              onChange={event => setDraft(values => ({ ...values, [field]: event.target.value }))} />
          </label>
        ))}
        <button type="submit" disabled={saving} className="glass-button">{t('liveQa.filter')}</button>
      </form>
      {state !== 'ready' && <p role="status">{t(`liveQa.${state}`)}</p>}
      {state === 'ready' && !rows.length && <p role="status">{t('liveQa.emptyQueue')}</p>}
      {rows.length > 0 && (
        <fieldset disabled={saving} className="space-y-3">
          <legend>{t('liveQa.selectCases')}</legend>
          {rows.map(row => (
            <label key={row._id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.includes(row._id)}
                onChange={event => {
                  const checked = event.target.checked;
                  setSelected(ids => checked ? [...ids, row._id] : ids.filter(id => id !== row._id));
                }} />
              {[row.district, row.icdCode, row.icdDescription, String(row.createdAt || '').slice(0, 10)].filter(Boolean).join(' · ')}
            </label>
          ))}
          <label className="block text-sm">
            {t('liveQa.caseReference')}
            <input className="glass-input block" value={reference} maxLength={200} onChange={event => setReference(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="glass-button" disabled={!selected.length || !reference.trim()} onClick={() => review('verified')}>{t('liveQa.verifySelected')}</button>
            <button type="button" className="glass-button" disabled={!selected.length} onClick={() => review('rejected')}>{t('liveQa.rejectSelected')}</button>
          </div>
        </fieldset>
      )}
    </section>
  );
}
