import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from '../../i18n/LanguageContext';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Download,
  Loader2,
  FileText,
  User,
  Building,
  Calendar,
  Lock,
  ArrowLeft,
} from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import { formatSriLankaDateTime } from '../../utils/sriLankaTime';

export default function VerifyConsultation() {
  const { token } = useParams();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null); // 'REVOKED' | 'EXPIRED' | 'NOT_FOUND' | 'ERROR'

  const [nic, setNic] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchVerification = async () => {
      setLoading(true);
      setErrorStatus(null);
      try {
        const res = await api.get(`/verify/${token}`);
        if (active) {
          setRecord(res.data);
        }
      } catch (err) {
        if (!active) return;
        const status = err.response?.status;
        const reason = err.response?.data?.reason;

        if (status === 410 || reason === 'TOKEN_REVOKED') {
          setErrorStatus('REVOKED');
        } else if (reason === 'TOKEN_EXPIRED') {
          setErrorStatus('EXPIRED');
        } else if (status === 404 || reason === 'TOKEN_NOT_FOUND') {
          setErrorStatus('NOT_FOUND');
        } else {
          setErrorStatus('ERROR');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    if (token) {
      fetchVerification();
    } else {
      setLoading(false);
      setErrorStatus('NOT_FOUND');
    }

    return () => {
      active = false;
    };
  }, [token]);

  const handleDownloadHistory = async (e) => {
    e.preventDefault();
    const trimmedNic = nic.trim();
    if (!trimmedNic) {
      return toast.error('Please enter patient NIC number.');
    }

    setDownloading(true);
    try {
      const response = await api.post(
        `/verify/${token}/history-pdf`,
        { nic: trimmedNic },
        { responseType: 'blob' }
      );

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MediSync-History-${trimmedNic.slice(-4)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Medical history PDF downloaded successfully.');
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        toast.error('Too many verification attempts. Please wait 15 minutes.');
      } else if (status === 401) {
        toast.error('Identity verification failed. The provided NIC does not match this record.');
      } else if (status === 503) {
        toast.error('PDF generation temporarily unavailable.');
      } else {
        toast.error('Unable to verify and download history. Please review the NIC entered.');
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto w-full space-y-6">
        {/* Navigation back */}
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-teal-400 hover:text-teal-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>MediSync Home</span>
          </Link>
          <span
            data-testid="clinical-validation-badge"
            className="text-[11px] font-mono text-amber-300/90 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20"
          >
            clinicalValidation: not_established
          </span>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="glass-card rounded-2xl p-8 border border-slate-800 text-center space-y-4">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Verifying cryptographic clinical token authenticity…</p>
          </div>
        )}

        {/* Error / Non-Valid States */}
        {!loading && errorStatus && (
          <div
            data-testid="verification-error-card"
            className="glass-card rounded-2xl p-8 border border-rose-500/30 bg-rose-950/20 text-center space-y-4"
          >
            <div className="w-14 h-14 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
              {errorStatus === 'REVOKED' ? (
                <ShieldAlert className="w-8 h-8" />
              ) : errorStatus === 'EXPIRED' ? (
                <Clock className="w-8 h-8" />
              ) : (
                <AlertTriangle className="w-8 h-8" />
              )}
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">
                {errorStatus === 'REVOKED'
                  ? t('verification.revoked', 'Consultation Record Revoked')
                  : errorStatus === 'EXPIRED'
                  ? t('verification.expired', 'Verification Link Expired')
                  : t('verification.notFound', 'Record Not Found or Invalid Token')}
              </h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                {errorStatus === 'REVOKED'
                  ? 'This clinical consultation verification token has been explicitly revoked by the treating clinician or patient.'
                  : errorStatus === 'EXPIRED'
                  ? 'This 90-day verification token has expired. Request a renewed verification link from the consulting physician.'
                  : 'The provided verification token is invalid, malformed, or has been removed from the platform registry.'}
              </p>
            </div>
          </div>
        )}

        {/* Valid Verified Record */}
        {!loading && record && record.valid && (
          <div className="space-y-6" data-testid="verification-success-view">
            {/* Authenticity Header Card */}
            <div className="glass-card rounded-2xl p-6 border border-teal-500/40 bg-teal-950/20 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-white">
                    {t('verification.verified', 'Authentic Clinical Consultation Record')}
                  </h1>
                  <p className="text-xs text-teal-300/80">
                    Cryptographically verified against the official MediSync medical register.
                  </p>
                </div>
              </div>

              {/* Verified Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-teal-400" />
                    {t('verification.consultationRef', 'Consultation Reference')}
                  </span>
                  <div className="font-mono font-bold text-white text-xs">{record.consultationRef}</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-teal-400" />
                    {t('verification.date', 'Encounter Date')}
                  </span>
                  <div className="font-semibold text-white text-xs">
                    {record.consultationDate ? formatSriLankaDateTime(record.consultationDate) : 'Recorded'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-teal-400" />
                    {t('verification.doctor', 'Consulting Practitioner')}
                  </span>
                  <div className="font-semibold text-white text-xs">{record.doctorName}</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-teal-400" />
                    {t('verification.facility', 'Medical Facility')}
                  </span>
                  <div className="font-semibold text-white text-xs">{record.hospital}</div>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed pt-1">
                {t('verification.disclaimer', 'Automated electronic record verification confirms practitioner authorization and cryptographic token validity. It does not establish clinical outcomes.')}
              </p>
            </div>

            {/* Authenticated Patient History Download Gate */}
            <div className="glass-card rounded-2xl p-6 border border-slate-800 bg-slate-900/40 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">
                    {t('verification.historyGateTitle', 'Download Patient Medical History')}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {t(
                      'verification.historyGateHelp',
                      'Enter the patient National Identity Card (NIC) number to verify identity and unlock the comprehensive consultation history.'
                    )}
                  </p>
                </div>
              </div>

              <form onSubmit={handleDownloadHistory} className="space-y-3 pt-2">
                <div>
                  <label htmlFor="nic-input" className="block text-xs font-semibold text-slate-300 mb-1">
                    {t('verification.nicLabel', 'Patient NIC Number')}
                  </label>
                  <input
                    id="nic-input"
                    type="text"
                    value={nic}
                    onChange={(e) => setNic(e.target.value)}
                    placeholder={t('verification.nicPlaceholder', 'e.g. 199012345678 or 901234567V')}
                    maxLength={12}
                    className="w-full text-xs rounded-xl border border-slate-700 bg-slate-950/80 p-3 text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={downloading || !nic.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('verification.downloading', 'Verifying & Generating PDF…')}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>{t('verification.downloadBtn', 'Verify Identity & Download History PDF')}</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto w-full text-center text-xs text-slate-500 pt-6">
        MediSync Secure Health Platform &bull; Privacy-Guarded Identity Verification
      </div>
    </div>
  );
}
