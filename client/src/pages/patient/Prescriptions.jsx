import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Pill, Clock, CheckCircle, AlertTriangle, Search,
  Download, FlaskConical, Loader2,
} from 'lucide-react';
import api from '../../api/axiosInstance';
import PageTransition from '../../components/common/PageTransition';
import { toast } from 'react-toastify';

/* ─────────────────────────────────────────────────────────────────────────────
   PDF Download helper — streams the NIC-locked PDF and triggers browser save
   ───────────────────────────────────────────────────────────────────────────── */
const downloadPdf = async (prescriptionId, setDownloading) => {
  if (!prescriptionId) {
    toast.error('No prescription ID available for this record.');
    return;
  }
  setDownloading(true);
  try {
    const response = await api.get(`/prescription/download/${prescriptionId}`, {
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `E-Prescription-${prescriptionId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('E-Prescription downloaded. Open it with your NIC as the password.');
  } catch (err) {
    const msg = err.response?.data?.error || err.message || 'Download failed';
    toast.error(msg);
  } finally {
    setDownloading(false);
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   PrescriptionCard
   ───────────────────────────────────────────────────────────────────────────── */
const PrescriptionCard = ({ rx, badge, index }) => {
  const [downloading, setDownloading] = useState(false);
  const isActive = rx.status === 'issued' && (!rx.expiresAt || new Date(rx.expiresAt) > new Date());

  return (
    <motion.div
      key={rx._id || index}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="glass-panel rounded-xl border border-slate-700/50 p-5 hover:border-slate-600/70 hover:shadow-[0_0_28px_rgba(16,185,129,0.07)] transition-all duration-300 flex flex-col gap-4"
    >
      {/* ── Header ── */}
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-white truncate">{rx.drugName || 'Prescription'}</h3>
            {rx.consultationRef && (
              <span className="text-[9px] font-bold text-slate-400 border border-slate-700/50 bg-slate-800/30 px-1.5 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0 mt-0.5">
                Ref: {rx.consultationRef}
              </span>
            )}
          </div>
          <p className="text-sm text-teal-400 mt-0.5">Dr. {rx.doctorName || 'Unknown'}</p>
          {rx.hospitalName && (
            <p className="text-xs text-slate-500 mt-0.5">{rx.hospitalName}</p>
          )}
        </div>
        <span className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${badge.cls}`}>
          {badge.text}
        </span>
      </div>

      {/* ── Drug details grid ── */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {rx.dosage && (
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide">Dosage</p>
            <p className="text-slate-200 font-medium mt-0.5">{rx.dosage}</p>
          </div>
        )}
        {rx.frequency && (
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide">Frequency</p>
            <p className="text-slate-200 font-medium mt-0.5">{rx.frequency}</p>
          </div>
        )}
        {rx.durationDays && (
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide">Duration</p>
            <p className="text-slate-200 font-medium mt-0.5">{rx.durationDays} days</p>
          </div>
        )}
        {rx.instructions && (
          <div className="col-span-2">
            <p className="text-slate-500 text-xs uppercase tracking-wide">Instructions</p>
            <p className="text-slate-300 text-xs mt-0.5 italic">{rx.instructions}</p>
          </div>
        )}
      </div>

      {/* ── Lab test tags ── */}
      {rx.labTests?.length > 0 && (
        <div>
          <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1.5">Lab Tests Ordered</p>
          <div className="flex flex-wrap gap-1.5">
            {rx.labTests.map((t, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/12 border border-purple-500/25 text-purple-300 text-[10px] font-bold"
              >
                <FlaskConical className="w-2.5 h-2.5 flex-shrink-0" />{t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── For (diagnosis) ── */}
      {rx.diagnosis && (
        <div className="text-xs text-slate-500 border-t border-slate-700/40 pt-3">
          <span className="font-semibold text-slate-400">For: </span>{rx.diagnosis}
        </div>
      )}

      {/* ── Footer: dates + PDF download button ── */}
      <div className="border-t border-slate-700/30 pt-3 mt-auto">
        <div className="flex justify-between text-xs text-slate-500 mb-3">
          <span>Issued: {rx.consultationDate ? new Date(rx.consultationDate).toLocaleDateString() : 'N/A'}</span>
          {rx.expiresAt && <span>Expires: {new Date(rx.expiresAt).toLocaleDateString()}</span>}
        </div>

        {/* PDF download — shown for all statuses so patients can always retrieve their record */}
        {rx.prescriptionId && (
          <button
            id={`download-pdf-${rx.prescriptionId}`}
            onClick={() => downloadPdf(rx.prescriptionId, setDownloading)}
            disabled={downloading}
            className={`
              w-full flex items-center justify-center gap-2.5
              px-4 py-2.5 rounded-xl
              text-sm font-bold tracking-wide
              border transition-all duration-300
              ${isActive
                ? 'bg-gradient-to-r from-emerald-600/20 to-teal-600/20 border-emerald-500/35 text-emerald-300 hover:from-emerald-600/35 hover:to-teal-600/35 hover:border-emerald-400/50 hover:shadow-[0_4px_20px_rgba(16,185,129,0.20)]'
                : 'bg-slate-800/40 border-slate-600/40 text-slate-400 hover:bg-slate-700/40 hover:text-slate-200 hover:border-slate-500/60'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {downloading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF…</>
              : <><Download className="w-4 h-4" /> Download E-Prescription (PDF)</>
            }
          </button>
        )}

        {/* Hint: password is patient's NIC */}
        {rx.prescriptionId && (
          <p className="text-center text-slate-600 text-[10px] mt-1.5">
            🔒 PDF is password-protected with your NIC
          </p>
        )}
      </div>
    </motion.div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   PatientPrescriptions — main page
   ───────────────────────────────────────────────────────────────────────────── */
const PatientPrescriptions = () => {
  const [prescriptions, setPrescriptions] = useState([]);
  const [activeTab,     setActiveTab]     = useState('active');
  const [searchQuery,   setSearchQuery]   = useState('');

  let nic = localStorage.getItem('nic');
  if (!nic) {
    const userStr = localStorage.getItem('user');
    if (userStr) { try { nic = JSON.parse(userStr).nic; } catch (e) {} }
  }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['patientPrescriptions', nic],
    queryFn:  async () => {
      const res = await api.get(`/patient/${nic}/prescriptions`);
      console.log("PRESCRIPTIONS DATA:", res.data);
      return res.data.data || res.data;
    },
    enabled:   !!nic,
    retry:     1,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!data) return;
    const allRx = [];
    const rxDataArray = Array.isArray(data) ? data : [];

    rxDataArray.forEach(rxData => {
      if (rxData.medications && Array.isArray(rxData.medications) && rxData.medications.length > 0) {
        rxData.medications.forEach(m => {
          allRx.push({
            ...rxData,
            _id:              `${rxData._id}-${m.name}`,
            drugName:         m.name,
            dosage:           m.dosage,
            frequency:        m.frequency,
            durationDays:     m.durationDays,
            doctorName:       rxData.doctorId?.fullName   || 'Doctor',
            hospitalName:     rxData.hospitalId?.name     || '',
            consultationDate: rxData.createdAt,
          });
        });
      } else {
        allRx.push({
          ...rxData,
          doctorName:       rxData.doctorId?.fullName   || 'Doctor',
          hospitalName:     rxData.hospitalId?.name     || '',
          consultationDate: rxData.createdAt,
        });
      }
    });
    setPrescriptions(allRx);
  }, [data]);

  const now = new Date();

  const categorized = {
    active:    prescriptions.filter(rx => rx.status === 'issued' && (!rx.expiresAt || new Date(rx.expiresAt) > now)),
    dispensed: prescriptions.filter(rx => rx.status === 'dispensed'),
    expired:   prescriptions.filter(rx => rx.status === 'expired' || (rx.status === 'issued' && rx.expiresAt && new Date(rx.expiresAt) <= now)),
  };

  const filteredRx = (categorized[activeTab] || []).filter(rx => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return rx.drugName?.toLowerCase().includes(q) || rx.doctorName?.toLowerCase().includes(q);
  });

  const tabs = [
    { key: 'active',    label: 'Active',    icon: Clock,          count: categorized.active.length,    color: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30' },
    { key: 'dispensed', label: 'Dispensed', icon: CheckCircle,    count: categorized.dispensed.length, color: 'text-blue-400 bg-blue-500/20 border-blue-500/30' },
    { key: 'expired',   label: 'Expired',   icon: AlertTriangle,  count: categorized.expired.length,   color: 'text-red-400 bg-red-500/20 border-red-500/30' },
  ];

  const getStatusBadge = (rx) => {
    if (rx.status === 'dispensed') return { text: 'Dispensed',        cls: 'bg-blue-500/20 text-blue-400' };
    if (rx.status === 'expired' || (rx.expiresAt && new Date(rx.expiresAt) <= now))
      return { text: 'Expired',           cls: 'bg-red-500/20 text-red-400' };
    return   { text: 'Ready for Pickup',  cls: 'bg-emerald-500/20 text-emerald-400' };
  };

  /* ── Guards ── */
  if (!nic) return (
    <div className="flex h-full items-center justify-center p-20 text-center">
      <div>
        <p className="text-red-500 font-semibold mb-2">Session expired.</p>
        <button onClick={() => window.location.href = '/patient/login'} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl">
          Go to Login
        </button>
      </div>
    </div>
  );

  if (isLoading) return (
    <div className="flex h-full items-center justify-center p-20">
      <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (isError) return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 m-4 text-center">
      <p className="text-red-400 font-semibold mb-2">Failed to load prescriptions</p>
      <p className="text-red-500/70 text-sm mb-4">{error?.response?.data?.error || error?.message || 'Unknown error'}</p>
      <button onClick={() => window.location.reload()} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded text-sm">
        Retry
      </button>
    </div>
  );

  return (
    <PageTransition className="p-4 md:p-8">

      {/* ── Page header ── */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">My Prescriptions</h1>
        <p className="text-slate-400 mt-1">
          Track all your medications and download your E-Prescriptions.
        </p>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex flex-wrap gap-3 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.key}
            id={`tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
              activeTab === tab.key
                ? tab.color
                : 'text-slate-400 bg-slate-800/40 border-slate-700/50 hover:border-slate-600'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            <span className={`text-xs px-2 py-0.5 rounded-full ml-1 ${activeTab === tab.key ? 'bg-white/10' : 'bg-slate-700'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="w-4 h-4 text-slate-500" />
        </div>
        <input
          type="text"
          id="prescription-search"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by drug name or doctor..."
          className="w-full pl-11 pr-4 py-3 bg-slate-800/40 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-transparent transition-all"
        />
      </div>

      {/* ── PDF hint banner (active tab only) ── */}
      {activeTab === 'active' && filteredRx.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 mb-5 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
          <Download className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <p className="text-emerald-300 text-xs font-medium">
            Your E-Prescriptions are digitally locked with your NIC as the password.
            Download and present them at any registered pharmacy.
          </p>
        </div>
      )}

      {/* ── Prescription cards ── */}
      {filteredRx.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <Pill className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg">No {activeTab} prescriptions found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRx.map((rx, index) => (
            <PrescriptionCard
              key={rx._id || index}
              rx={rx}
              badge={getStatusBadge(rx)}
              index={index}
            />
          ))}
        </div>
      )}
    </PageTransition>
  );
};

export default PatientPrescriptions;
