import React, { useState, useEffect } from 'react';
import { Globe, Check, Loader2, AlertCircle, Save } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';

/**
 * LanguagePreferenceCard — Enterprise trilingual preference selector
 * Integrates with /auth/preferences/language (Agent B backend contract)
 * Supports all 5 user roles: Admin, Doctor, Patient, Pharmacist, Hospital Admin
 */
const LanguagePreferenceCard = ({ className = '' }) => {
  const { language, setLanguage, t, languages } = useTranslation();
  const [persistedLang, setPersistedLang] = useState(null);
  const [selectedLang, setSelectedLang] = useState(language || 'en');
  const [persistenceAvailable, setPersistenceAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Load persisted language from server on mount
  useEffect(() => {
    let isMounted = true;
    const fetchPreference = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const res = await api.get('/auth/preferences/language');
        const isPersistAvail = res?.data?.data?.persistenceAvailable === true;
        const serverLang = res?.data?.data?.preferredLanguage;
        if (isMounted) {
          setPersistenceAvailable(Boolean(isPersistAvail));
          if (isPersistAvail && serverLang && ['en', 'si', 'ta'].includes(serverLang)) {
            setPersistedLang(serverLang);
            setSelectedLang(serverLang);
            // Sync with local context if different
            if (serverLang !== language) {
              setLanguage(serverLang);
            }
          } else {
            setPersistedLang(null);
            const fallback = localStorage.getItem('medisync_language') || language || 'en';
            setSelectedLang(fallback);
          }
        }
      } catch (err) {
        // Fallback gracefully to current context or localStorage without crashing
        if (isMounted) {
          setPersistenceAvailable(false);
          setPersistedLang(null);
          const fallback = localStorage.getItem('medisync_language') || language || 'en';
          setSelectedLang(fallback);
          if (err.response?.status === 503) {
            setErrorMessage(t('preferences.persistenceHeld503', 'Account persistence for this profile is held pending administrative schema authorization (Patch 07).'));
          } else if (err.response?.status === 403 || err.response?.status === 401) {
            setErrorMessage(t('preferences.authError', 'Session verification required to sync language preference.'));
          } else if (err.code === 'ERR_NETWORK' || !err.response) {
            setErrorMessage(t('preferences.networkError', 'Network connectivity issue. Using offline language cache.'));
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPreference();
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (code) => {
    setSelectedLang(code);
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!persistenceAvailable) {
      // Immediate local session preview without claiming database save
      setLanguage(code);
      try {
        localStorage.setItem('medisync_language', code);
      } catch (_) {}
    }
  };

  const handleSave = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!persistenceAvailable) {
      setErrorMessage(t('preferences.persistenceUnavailableNotice', 'Account database persistence is unavailable for your profile. Local session language has been applied.'));
      return;
    }
    if (persistedLang && selectedLang === persistedLang) {
      toast.info(t('preferences.alreadySaved', 'Selected language is already your active account preference.'));
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Backend contract: PATCH /auth/preferences/language with { preferredLanguage: code }
      const res = await api.patch('/auth/preferences/language', {
        preferredLanguage: selectedLang
      });

      const serverUpdated = res?.data?.data?.preferredLanguage;
      const serverPersist = res?.data?.data?.persistenceAvailable === true;

      if (serverUpdated && ['en', 'si', 'ta'].includes(serverUpdated) && serverPersist) {
        setPersistedLang(serverUpdated);
        setSelectedLang(serverUpdated);

        // Apply to immediate UI context & localStorage
        setLanguage(serverUpdated);
        try {
          localStorage.setItem('medisync_language', serverUpdated);
          localStorage.setItem('preferredLanguage', serverUpdated);
        } catch (_) {}

        setSuccessMessage(t('preferences.savedSuccess', 'Language preference updated and saved to your account.'));
        toast.success(t('preferences.toastSaved', 'Language preference saved successfully.'));
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        // Malformed or missing backend acknowledgement
        setErrorMessage(t('preferences.saveUnconfirmed', 'Server response did not confirm account preference persistence.'));
        toast.error(t('preferences.toastError', 'Failed to save language preference.'));
      }
    } catch (err) {
      if (err.response?.status === 503) {
        setPersistenceAvailable(false);
        setLanguage(selectedLang);
        try {
          localStorage.setItem('medisync_language', selectedLang);
        } catch (_) {}
        setErrorMessage(t('preferences.persistenceHeld503', 'Account persistence for this profile is held pending administrative schema authorization (Patch 07).'));
      } else if (err.response?.status === 403 || err.response?.status === 401) {
        setErrorMessage(t('preferences.deniedError', 'Permission denied or session expired. Please re-authenticate.'));
      } else {
        const errorText = err.response?.data?.error || err.message || 'Failed to save preference';
        setErrorMessage(errorText);
      }
      toast.error(t('preferences.toastError', 'Failed to save language preference.'));
    } finally {
      setSaving(false);
    }
  };

  const LANGUAGE_DESCRIPTIONS = {
    en: { name: 'English', native: 'English', badge: 'Default', desc: 'Standard clinical decision terminology and interfaces.' },
    si: { name: 'Sinhala', native: 'සිංහල', badge: 'ජාතික', desc: 'ජාතික භාෂා පරිවර්තනය සහ සායනික වාර්තා අතුරුමුහුණත.' },
    ta: { name: 'Tamil', native: 'தமிழ்', badge: 'தேசிய', desc: 'தேசிய மொழிபெயர்ப்பு மற்றும் மருத்துவ அறிக்கைகள் இடைமுகம்.' }
  };

  return (
    <div className={`glass-card p-6 rounded-2xl border border-white/5 space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4 select-none">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              {t('preferences.languageTitle', 'Language & Localization Preferences')}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('preferences.languageSubtitle', 'Select your preferred official language for dashboard content, notifications, and generated documents.')}
            </p>
          </div>
        </div>
        {loading && <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />}
      </div>

      {/* Status banner if message */}
      {!loading && !persistenceAvailable && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{t('preferences.persistenceUnavailable', 'Account database persistence is unavailable for this profile. Selection applies to your local browser session only.')}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Radio options */}
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Preferred Language">
        {languages.map((item) => {
          const isSelected = selectedLang === item.code;
          const isPersisted = persistedLang === item.code;
          const meta = LANGUAGE_DESCRIPTIONS[item.code] || { name: item.label, native: item.label, badge: '', desc: '' };

          return (
            <div
              key={item.code}
              onClick={() => handleSelect(item.code)}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') handleSelect(item.code); }}
              tabIndex={0}
              role="radio"
              aria-checked={isSelected}
              className={`relative cursor-pointer p-4 rounded-xl border transition-all text-left flex flex-col justify-between ${
                isSelected
                  ? 'bg-teal-500/15 border-teal-400/40 shadow-lg shadow-teal-500/5'
                  : 'bg-slate-900/40 border-white/5 hover:border-white/10 hover:bg-slate-900/60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base font-bold text-white tracking-wide">{meta.native}</span>
                  <div className="flex items-center gap-1.5">
                    {persistenceAvailable && Boolean(persistedLang) && isPersisted && (
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-white/10">
                        {t('preferences.savedBadge', 'Saved')}
                      </span>
                    )}
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      isSelected ? 'border-teal-400 bg-teal-400 text-slate-950' : 'border-slate-600'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-400 font-medium mb-1">{meta.name}</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">{meta.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions and disclaimer footer */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-3 border-t border-white/5">
        <p className="text-[11px] text-slate-500 leading-normal max-w-md">
          {t('preferences.policyNotice', 'Language preference is securely bound to your verified user account. Clinical international drug names (INN) and ICD-10 diagnostic codes remain globally standardized.')}
        </p>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {persistenceAvailable && Boolean(persistedLang) && selectedLang !== persistedLang && (
            <button
              type="button"
              onClick={() => { setSelectedLang(persistedLang); setErrorMessage(null); }}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white text-xs font-semibold transition-all"
            >
              {t('common.cancel', 'Revert')}
            </button>
          )}

          {persistenceAvailable ? (
            <button
              type="button"
              aria-label="Save Account Preference"
              onClick={handleSave}
              disabled={saving || loading || (Boolean(persistedLang) && selectedLang === persistedLang)}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 text-white font-bold text-xs transition-all disabled:opacity-40 flex items-center justify-center gap-1.5 shadow-md shadow-teal-500/10"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('preferences.saving', 'Saving...')}</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{t('preferences.saveButton', 'Save Account Preference')}</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={true}
              aria-disabled="true"
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-slate-800 text-slate-400 font-bold text-xs border border-white/10 flex items-center justify-center gap-1.5 cursor-not-allowed opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{t('preferences.persistenceHeldButton', 'Database Persistence Unavailable')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LanguagePreferenceCard;
