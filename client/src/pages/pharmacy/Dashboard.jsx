import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Package, Clock, Search, CheckCircle, Pill, ShoppingBag,
  Plus, Trash2, Loader2, Users, BarChart3, UserCircle, Shield, Mail,
  TrendingUp, AlertTriangle, RefreshCw, Activity, X, Settings, Camera
} from 'lucide-react';
import api from '../../api/axiosInstance';
import Sidebar from '../../components/common/Sidebar';
import PageTransition from '../../components/common/PageTransition';
import ActiveOutbreakBanner from '../../components/common/ActiveOutbreakBanner';

/* ─── Helper: read role stored by pharmacy login ─────────────────────────── */
function getPharmacyRole() {
  // pharmacy/Login.jsx stores the role directly: localStorage.setItem('role', role)
  return localStorage.getItem('role') || null;
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB: Dispense (Fulfill doctor prescription)
   ══════════════════════════════════════════════════════════════════════════════ */
const Dispense = () => {
  const [nic, setNic] = useState('');
  const [prescriptions, setPrescriptions] = useState([]);
  const [patientInfo, setPatientInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dispensing, setDispensing] = useState(false);
  // Alternative dispense modal state
  const [altModal, setAltModal] = useState(null); // null | { rx }
  const [isAlt, setIsAlt] = useState(false);
  const [altDetails, setAltDetails] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!nic) return toast.error('Enter Patient NIC');
    setLoading(true);
    try {
      const { data } = await api.get(`/pharmacy/prescriptions/pending/${nic}`);
      if (data.data.prescriptions) {
        setPrescriptions(data.data.prescriptions);
        setPatientInfo(data.data.patient);
        if (data.data.prescriptions.length === 0) toast.info('No pending prescriptions found for this NIC.');
      } else {
        setPrescriptions(data.data);
        setPatientInfo(null);
        if (data.data.length === 0) toast.info('No pending prescriptions found for this NIC.');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to fetch prescriptions');
    } finally {
      setLoading(false);
    }
  };

  const openDispenseModal = (rx) => {
    setIsAlt(false);
    setAltDetails('');
    setAltModal(rx);
  };

  const confirmDispense = async () => {
    if (!altModal) return;
    if (isAlt && !altDetails.trim()) return toast.error('Please describe the alternative medication dispensed.');
    setDispensing(true);
    try {
      await api.post('/pharmacy/dispense', {
        prescriptionId: altModal.prescriptionId,
        patientNic: altModal.patientNic,
        isAlternativeDispensed: isAlt,
        alternativeDetails: isAlt ? altDetails.trim() : undefined,
      });
      toast.success('Prescription dispensed! Patient notification email sent.');
      setPrescriptions(prev => prev.filter(p => p._id !== altModal._id));
      setAltModal(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to dispense');
    } finally {
      setDispensing(false);
    }
  };

  return (
    <PageTransition className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Dispense Medication</h1>
        <p className="text-slate-400 mt-1">Search and fulfill patient e-prescriptions.</p>
      </div>

      <div className="glass-panel p-6 rounded-2xl mb-8 max-w-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-5">
          <Search className="w-32 h-32 text-emerald-500" />
        </div>
        <form onSubmit={handleSearch} className="relative z-10 flex gap-4">
          <div className="flex-1">
            <input
              type="text" value={nic} onChange={(e) => setNic(e.target.value)}
              placeholder="Enter Patient NIC (e.g. 981234567V)"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-6 py-4 text-white text-lg focus:border-emerald-500 outline-none uppercase placeholder:normal-case placeholder:text-slate-500"
            />
          </div>
          <button type="submit" disabled={loading}
            className="glass-button bg-emerald-600 hover:bg-emerald-500 text-white px-8 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            {loading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <><Search className="w-5 h-5 mr-2" />Find</>}
          </button>
        </form>
      </div>

      {patientInfo && (
        <div className="glass-panel p-6 rounded-2xl mb-8 flex flex-col md:flex-row gap-6 items-center border border-emerald-500/20 bg-emerald-500/5">
          <div className="w-16 h-16 rounded-2xl bg-emerald-600/20 flex items-center justify-center border border-emerald-500/30 flex-shrink-0">
            <UserCircle className="w-8 h-8 text-emerald-400" />
          </div>
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Patient Name</p>
              <p className="text-white font-semibold break-all overflow-hidden">{patientInfo.fullName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Contact</p>
              <p className="text-slate-300 break-all overflow-hidden">{patientInfo.contactInfo || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Blood Group</p>
              <p className="text-red-400 font-bold break-all overflow-hidden">{patientInfo.bloodGroup || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Date of Birth</p>
              <p className="text-slate-300 break-all overflow-hidden">{patientInfo.dateOfBirth ? new Date(patientInfo.dateOfBirth).toLocaleDateString() : 'N/A'}</p>
            </div>
          </div>
        </div>
      )}

      {prescriptions.length > 0 && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-800/50 bg-slate-800/30 flex justify-between items-center">
            <h2 className="text-lg font-bold text-white flex items-center">
              <Pill className="w-5 h-5 mr-2 text-emerald-400" />
              Active Prescriptions for <span className="ml-2 px-2 py-1 bg-slate-700 rounded text-emerald-400 font-mono text-sm">{nic}</span>
            </h2>
            <span className="text-sm text-slate-400">{prescriptions.length} items found</span>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {prescriptions.map((rx, index) => {
              const mainDrug = rx.medications && rx.medications.length > 0 ? rx.medications[0] : null;
              return (
                <div key={rx._id} className="bg-slate-800/40 border border-slate-700 p-5 rounded-xl flex flex-col justify-between hover:bg-slate-800/60 transition-colors"
                  style={{ animationDelay: `${index * 100}ms` }}>
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="text-xl font-bold text-white">{mainDrug?.name || rx.drugName || 'Unknown Drug'}</h3>
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-bold rounded">#{rx.prescriptionId?.split('-')[1] || rx.prescriptionId}</span>
                    </div>
                    {mainDrug && (
                      <div className="space-y-1 mb-4 text-sm text-slate-300">
                        <p><span className="text-slate-500 w-20 inline-block">Dosage:</span> {mainDrug.dosage}</p>
                        <p><span className="text-slate-500 w-20 inline-block">Freq:</span> {mainDrug.frequency}</p>
                        <p><span className="text-slate-500 w-20 inline-block">Duration:</span> {mainDrug.durationDays} Days</p>
                      </div>
                    )}
                    <p className="text-sm text-slate-400 mb-4 border-t border-slate-700/50 pt-3">
                      Prescribed by <span className="text-slate-300">Dr. {rx.doctorId?.fullName || 'Unknown'}</span>
                    </p>
                  </div>
                  <button onClick={() => openDispenseModal(rx)} disabled={dispensing}
                    className="w-full py-3 bg-emerald-600/20 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-lg font-bold transition-all flex items-center justify-center gap-2">
                    <CheckCircle className="w-5 h-5" /> Dispense Now
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Alternative Dispense Modal ─────────────────────────────────────── */}
      {altModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">Confirm Dispensing</h3>
                <p className="text-slate-400 text-sm">{altModal.medications?.[0]?.name || altModal.drugName}</p>
              </div>
            </div>

            {/* Alternative checkbox */}
            <label className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 cursor-pointer mb-4 hover:bg-amber-500/10 transition-colors">
              <input
                type="checkbox" checked={isAlt} onChange={e => setIsAlt(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-amber-400 flex-shrink-0"
              />
              <div>
                <p className="text-amber-300 font-semibold text-sm">Dispense Alternative / Brand Substitute</p>
                <p className="text-slate-500 text-xs mt-0.5">Check if dispensing a different drug or brand than originally prescribed.</p>
              </div>
            </label>

            {isAlt && (
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Alternative Drug / Brand Given *
                </label>
                <input
                  type="text"
                  value={altDetails}
                  onChange={e => setAltDetails(e.target.value)}
                  placeholder="e.g. Calpol 500mg (generic substitute for Panadol)"
                  autoFocus
                  className="w-full bg-slate-800/50 border border-amber-500/40 rounded-xl px-4 py-3 text-white text-sm focus:border-amber-400 outline-none placeholder:text-slate-600 transition-colors"
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setAltModal(null)}
                className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 font-bold transition-all"
              >Cancel</button>
              <button
                onClick={confirmDispense}
                disabled={dispensing || (isAlt && !altDetails.trim())}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {dispensing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Confirm Dispense
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   TAB: Dispensing History
   ══════════════════════════════════════════════════════════════════════════════ */
const History = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/pharmacy/history').then(res => {
      setHistory(res.data.data || []);
      setLoading(false);
    }).catch(() => {
      toast.error('Failed to load history');
      setLoading(false);
    });
  }, []);

  return (
    <PageTransition className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Dispensing History</h1>
        <p className="text-slate-400 mt-1">Review recently fulfilled prescriptions.</p>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-400">Loading history...</p>
          </div>
        ) : history.length > 0 ? (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-800/80 border-b border-slate-700 text-slate-300">
              <tr>
                <th className="px-6 py-4 font-medium">Receipt No</th>
                <th className="px-6 py-4 font-medium">Patient NIC</th>
                <th className="px-6 py-4 font-medium">Medication(s)</th>
                <th className="px-6 py-4 font-medium">Dispensed By</th>
                <th className="px-6 py-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map(record => {
                const drugLabel = record.prescriptionId?.medications?.length > 0
                  ? record.prescriptionId.medications.map(m => m.name).join(', ')
                  : (record.items?.[0]?.drugName || record.prescriptionId?.drugName || '—');
                return (
                  <tr key={record._id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 text-white font-mono text-sm">{record.receiptNumber || '—'}</td>
                    <td className="px-6 py-4 text-slate-300 font-mono text-sm">{record.patientNic || '—'}</td>
                    <td className="px-6 py-4 text-slate-300 text-sm max-w-[180px] truncate" title={drugLabel}>{drugLabel}</td>
                    <td className="px-6 py-4 text-slate-400">{record.staffId?.fullName || '—'}</td>
                    <td className="px-6 py-4 text-slate-500 text-sm">{new Date(record.createdAt).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center text-slate-500">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No dispensing history found.</p>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   TAB: Manual OTC Dispensing
   ══════════════════════════════════════════════════════════════════════════════ */
const emptyMed = () => ({ name: '', dosage: '', frequency: '' });

const ManualDispenseOTC = () => {
  const [patientNic, setPatientNic] = useState('');
  const [consultationRef, setConsultationRef] = useState('');
  const [medications, setMedications] = useState([emptyMed()]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);

  const updateMed = (index, field, value) =>
    setMedications(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patientNic.trim()) return toast.error('Patient NIC is required.');
    const validMeds = medications.filter(m => m.name.trim());
    if (validMeds.length === 0) return toast.error('At least one medication name is required.');
    setSubmitting(true);
    try {
      const res = await api.post('/pharmacy/dispense-otc', {
        patientNic: patientNic.trim().toUpperCase(),
        consultationRef: consultationRef.trim() || undefined,
        medications: validMeds,
        notes: notes.trim(),
      });
      toast.success(`OTC dispensation recorded! (${validMeds.length} medication${validMeds.length > 1 ? 's' : ''})`);
      setLastReceipt(res.data.data);
      setPatientNic(''); setConsultationRef(''); setMedications([emptyMed()]); setNotes('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'OTC dispensing failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageTransition className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Manual OTC Dispense</h1>
        <p className="text-slate-400 mt-1">Record direct over-the-counter dispensation without a doctor's prescription.</p>
      </div>

      {lastReceipt && (
        <div className="glass-panel rounded-2xl p-5 mb-8 border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-emerald-300 font-bold">Dispensation Recorded Successfully</p>
              <p className="text-slate-400 text-sm mt-0.5">{lastReceipt.medicationCount} medication(s) saved to patient record.</p>
            </div>
          </div>
          <button onClick={() => setLastReceipt(null)} className="text-slate-500 hover:text-white text-xs underline">Dismiss</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <div className="glass-panel p-6 rounded-2xl">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Patient NIC</label>
          <input type="text" value={patientNic} onChange={e => setPatientNic(e.target.value)}
            placeholder="e.g. 981234567V or 200012345678"
            className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-5 py-3.5 text-white text-base focus:border-emerald-500 outline-none uppercase placeholder:normal-case placeholder:text-slate-500 transition-colors mb-5" />

          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Consultation Ref (Optional)</label>
          <input type="text" value={consultationRef} onChange={e => setConsultationRef(e.target.value)}
            placeholder="e.g. CON-XXXXXX"
            className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-5 py-3.5 text-white text-base focus:border-emerald-500 outline-none uppercase placeholder:normal-case placeholder:text-slate-500 transition-colors" />
        </div>

        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Medications</label>
            <button type="button" onClick={() => setMedications(prev => [...prev, emptyMed()])}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-600/30 transition-all">
              <Plus className="w-3.5 h-3.5" /> Add Drug
            </button>
          </div>
          <div className="space-y-3">
            {/* Drug auto-suggest datalist */}
            <datalist id="drug-suggestions">
              {[
                'Paracetamol 500mg','Panadol 500mg','Calpol 500mg',
                'Amoxicillin 250mg','Amoxicillin 500mg','Amoxiclav 625mg',
                'Ibuprofen 200mg','Ibuprofen 400mg','Brufen 400mg',
                'Cetirizine 10mg','Piriton 4mg','Loratadine 10mg',
                'Metformin 500mg','Metformin 1000mg','Glibenclamide 5mg',
                'Amlodipine 5mg','Amlodipine 10mg','Atenolol 50mg',
                'Omeprazole 20mg','Pantoprazole 40mg','Ranitidine 150mg',
                'Azithromycin 250mg','Azithromycin 500mg',
                'Ciprofloxacin 500mg','Doxycycline 100mg',
                'Prednisolone 5mg','Betamethasone 0.5mg',
                'Salbutamol Inhaler','Beclometasone Inhaler',
                'Atorvastatin 10mg','Atorvastatin 40mg','Simvastatin 20mg',
                'Clopidogrel 75mg','Aspirin 75mg','Aspirin 300mg',
                'Diazepam 5mg','Alprazolam 0.5mg',
                'Vitamin C 500mg','Vitamin D3 1000IU','Zinc Sulphate 20mg',
                'Folic Acid 5mg','Ferrous Sulphate 200mg',
                'Metronidazole 400mg','Fluconazole 150mg',
                'Benzac AC 2.5% Gel','Clindamycin Gel 1%',
                'Hyoscine Butylbromide 10mg','Domperidone 10mg','Ondansetron 4mg',
                'Tramadol 50mg','Codeine Phosphate 30mg',
              ].map(drug => <option key={drug} value={drug} />)}
            </datalist>

            {medications.map((med, idx) => (
              <div key={idx} className="flex items-start gap-3 bg-slate-800/40 rounded-xl p-3 border border-slate-700/50">
                <span className="text-slate-500 text-xs font-mono font-bold pt-3.5 w-5 text-center flex-shrink-0">{idx + 1}</span>
                <div className="grid grid-cols-3 gap-2 flex-1">
                  <input
                    type="text"
                    list="drug-suggestions"
                    value={med.name}
                    onChange={e => updateMed(idx, 'name', e.target.value)}
                    placeholder="Drug name* (start typing to search)"
                    className="col-span-3 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-emerald-500 outline-none placeholder:text-slate-600 transition-colors" />
                  <input type="text" value={med.dosage} onChange={e => updateMed(idx, 'dosage', e.target.value)}
                    placeholder="Dosage (e.g. 500mg)"
                    className="bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-emerald-500 outline-none placeholder:text-slate-600 transition-colors" />
                  <input type="text" value={med.frequency} onChange={e => updateMed(idx, 'frequency', e.target.value)}
                    placeholder="Frequency"
                    className="bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-emerald-500 outline-none placeholder:text-slate-600 transition-colors" />
                  <button type="button" onClick={() => { if (medications.length > 1) setMedications(prev => prev.filter((_, i) => i !== idx)); }}
                    disabled={medications.length === 1}
                    className="flex items-center justify-center rounded-lg border border-red-500/20 text-red-500/40 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Notes <span className="text-slate-600 normal-case font-medium">(optional)</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="Any additional notes for this dispensation..."
            className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-5 py-3.5 text-white text-sm focus:border-emerald-500 outline-none placeholder:text-slate-500 resize-none transition-colors" />
        </div>

        <button type="submit" disabled={submitting}
          className="w-full py-4 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold rounded-2xl shadow-[0_0_20px_rgba(20,184,166,0.3)] hover:shadow-[0_0_30px_rgba(20,184,166,0.45)] transition-all duration-200 flex items-center justify-center gap-2.5 disabled:opacity-50 text-base tracking-wide">
          {submitting ? <><Loader2 className="w-5 h-5 animate-spin" />Recording...</> : <><ShoppingBag className="w-5 h-5" />Record OTC Dispensation</>}
        </button>
      </form>
    </PageTransition>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   TAB: 24-Hour Restock Analytics (local aggregation, no ML)
   ══════════════════════════════════════════════════════════════════════════════ */
const RestockAnalytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const res = await api.get('/pharmacy/analytics/restock');
      setData(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const { leaderboard, meta } = useMemo(() => {
    const lb = data?.data || [];
    return { leaderboard: lb, meta: data?.meta || {} };
  }, [data]);

  const maxDispensed = useMemo(() =>
    leaderboard.length > 0 ? Math.max(...leaderboard.map(r => r.totalDispensed24h)) : 1,
    [leaderboard]);

  return (
    <PageTransition className="p-4 md:p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-violet-400" />
            24-Hour Restock Analytics
          </h1>
          <p className="text-slate-400 mt-1">
            Top {leaderboard.length} fastest-depleting medications at{' '}
            <span className="text-violet-400 font-semibold">{meta.pharmacyName || 'your pharmacy'}</span>
            {' '}in the last 24 hours.
          </p>
        </div>
        <button onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm font-medium transition-all">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      {!loading && !error && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="glass-panel p-5 rounded-xl border border-violet-500/20">
            <p className="text-2xl font-bold text-white">{meta.drugsAnalyzed || 0}</p>
            <p className="text-xs text-slate-400 mt-1">Drugs Dispensed (24h)</p>
          </div>
          <div className="glass-panel p-5 rounded-xl border border-red-500/20">
            <p className="text-2xl font-bold text-red-400">{leaderboard.filter(r => r.isCritical).length}</p>
            <p className="text-xs text-slate-400 mt-1">Below Reorder Level</p>
          </div>
          <div className="glass-panel p-5 rounded-xl border border-emerald-500/20">
            <p className="text-2xl font-bold text-emerald-400">
              {leaderboard.reduce((sum, r) => sum + r.totalDispensed24h, 0)}
            </p>
            <p className="text-xs text-slate-400 mt-1">Total Units Dispensed</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Aggregating 24-hour dispensing data...</p>
        </div>
      )}

      {error && (
        <div className="glass-panel rounded-2xl p-8 border border-red-500/30 bg-red-500/5 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-400 font-semibold">Failed to load analytics.</p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition">Retry</button>
        </div>
      )}

      {!loading && !error && leaderboard.length === 0 && (
        <div className="glass-panel rounded-2xl p-12 text-center border border-violet-500/20 bg-violet-500/5">
          <Activity className="w-12 h-12 text-violet-400 mx-auto mb-4 opacity-50" />
          <p className="text-violet-400 font-semibold text-lg">No dispensing in the last 24 hours</p>
          <p className="text-slate-400 text-sm mt-2">Analytics will appear after the first dispense event of the day.</p>
        </div>
      )}

      {!loading && !error && leaderboard.length > 0 && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
          <div className="px-6 py-4 bg-slate-800/60 border-b border-slate-700 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-violet-400" />
            <span className="text-white font-semibold">Depletion Leaderboard</span>
            <span className="ml-auto text-xs text-slate-500">Since {new Date(meta.since).toLocaleString()}</span>
          </div>
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-800/40 text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 w-12">#</th>
                <th className="px-6 py-3">Drug Name</th>
                <th className="px-6 py-3 text-center">Dispensed (24h)</th>
                <th className="px-6 py-3 text-center">Current Stock</th>
                <th className="px-6 py-3 min-w-[160px]">Depletion Rate</th>
                <th className="px-6 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row) => {
                const barWidth = Math.round((row.totalDispensed24h / maxDispensed) * 100);
                const isLow = row.isCritical;
                const stockDisplay = row.currentStock !== null ? `${row.currentStock} ${row.unit}` : '—';
                return (
                  <tr key={row.rank}
                    className={`border-b border-slate-800/70 transition-colors ${isLow ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-slate-800/30'}`}>
                    <td className="px-6 py-4">
                      <span className={`text-lg font-bold ${row.rank <= 3 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {row.rank <= 3 ? ['🥇','🥈','🥉'][row.rank - 1] : `#${row.rank}`}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white font-semibold">{row.drugName}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-violet-300 font-bold text-lg">{row.totalDispensed24h}</span>
                      <span className="text-slate-500 text-xs ml-1">{row.unit}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`font-semibold ${isLow ? 'text-red-400' : 'text-slate-300'}`}>{stockDisplay}</span>
                      {row.reorderLevel !== null && (
                        <p className="text-xs text-slate-600 mt-0.5">Reorder @ {row.reorderLevel}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-700/60 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all duration-700 ${isLow ? 'bg-gradient-to-r from-red-500 to-red-400' : 'bg-gradient-to-r from-violet-600 to-violet-400'}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-10 text-right flex-shrink-0">
                          {row.percentDepleted !== null ? `${row.percentDepleted}%` : '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-bold border border-red-500/30">
                          <AlertTriangle className="w-3 h-3" /> Critical
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20">
                          <CheckCircle className="w-3 h-3" /> OK
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageTransition>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   TAB: District Restock Alerts (ML-powered)
   ══════════════════════════════════════════════════════════════════════════════ */
const RestockPredictor = () => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true); setIsError(false);
    try {
      const res = await api.get('/pharmacy/restock-alerts');
      setData(res.data);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const alerts = data?.alerts || [];
  const district = data?.district || '';

  const getStatusStyles = (status) => {
    if (status === 'Critical') return { border: 'border-red-500/40', bg: 'bg-red-500/10', badge: 'bg-red-500/20 text-red-400 border border-red-500/30', icon: '🚨', trend: 'text-red-400' };
    return { border: 'border-amber-500/40', bg: 'bg-amber-500/10', badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/30', icon: '⚠️', trend: 'text-amber-400' };
  };

  return (
    <PageTransition className="p-4 md:p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">District Restock Alerts</h1>
          <p className="text-slate-400 mt-1">Automated ML analysis of dispensing trends in <span className="text-emerald-400 font-semibold">{district || 'your district'}</span>.</p>
        </div>
        <button onClick={fetchAlerts} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm font-medium transition-all">
          <Package className="w-4 h-4" /> Refresh
        </button>
      </div>

      {!isLoading && !isError && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="glass-panel p-4 rounded-xl text-center"><p className="text-2xl font-bold text-white">{data?.drugsAnalyzed || 0}</p><p className="text-xs text-slate-400 mt-1">Drugs Analysed</p></div>
          <div className="glass-panel p-4 rounded-xl text-center"><p className="text-2xl font-bold text-red-400">{alerts.filter(a => a.status === 'Critical').length}</p><p className="text-xs text-slate-400 mt-1">Critical Alerts</p></div>
          <div className="glass-panel p-4 rounded-xl text-center"><p className="text-2xl font-bold text-amber-400">{alerts.filter(a => a.status === 'Warning').length}</p><p className="text-xs text-slate-400 mt-1">Warnings</p></div>
        </div>
      )}

      {isLoading && (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Running ML demand analysis across district dispensing data...</p>
        </div>
      )}
      {isError && (
        <div className="glass-panel rounded-2xl p-8 border border-red-500/30 bg-red-500/5 text-center">
          <p className="text-red-400 font-semibold">Failed to load restock alerts.</p>
          <p className="text-slate-500 text-sm mt-2">Ensure the backend and ML engine are running.</p>
          <button onClick={fetchAlerts} className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition">Retry</button>
        </div>
      )}
      {!isLoading && !isError && alerts.length === 0 && (
        <div className="glass-panel rounded-2xl p-12 text-center border border-emerald-500/20 bg-emerald-500/5">
          <p className="text-4xl mb-4">✅</p>
          <p className="text-emerald-400 font-semibold text-lg">All stock levels are stable</p>
          <p className="text-slate-400 text-sm mt-2">No significant demand spikes detected in {district} over the last 14 days.</p>
        </div>
      )}
      {alerts.length > 0 && (
        <div className="space-y-4">
          {alerts.map((alert, idx) => {
            const styles = getStatusStyles(alert.status);
            return (
              <div key={idx} className={`rounded-2xl border p-6 ${styles.border} ${styles.bg} flex items-start gap-5 transition-all`}>
                <span className="text-3xl shrink-0">{styles.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <h3 className="text-lg font-bold text-white">{alert.drugName}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${styles.badge}`}>{alert.status}</span>
                    <span className={`text-sm font-bold ${styles.trend}`}>{alert.trend}</span>
                  </div>
                  <p className="text-slate-300 text-sm">{alert.message}</p>
                  <div className="mt-3 flex gap-6 text-xs text-slate-500">
                    <span>Baseline avg: <span className="text-slate-400 font-medium">{alert.baselineDailyAvg} units/day</span></span>
                    <span>Recent avg: <span className="text-slate-400 font-medium">{alert.recentDailyAvg} units/day</span></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageTransition>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   TAB: Staff Management (pharmacy_admin only)
   ══════════════════════════════════════════════════════════════════════════════ */
const StaffManagement = () => {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'pharmacist' });
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const res = await api.get('/pharmacy/staff');
      setStaff(res.data.data || []);
    } catch {
      toast.error('Failed to load staff list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStaff(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return toast.error('Name and email are required');
    setSubmitting(true);
    try {
      await api.post('/pharmacy/staff', form);
      toast.success(`Staff member added! A temporary password has been sent to ${form.email}.`);
      setForm({ name: '', email: '', role: 'pharmacist' });
      setShowForm(false);
      fetchStaff();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add staff');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id, currentStatus) => {
    setTogglingId(id);
    try {
      await api.put(`/pharmacy/staff/${id}/toggle`);
      toast.success(`Account ${currentStatus ? 'deactivated' : 'activated'}`);
      setStaff(prev => prev.map(s => s._id === id ? { ...s, isActive: !s.isActive } : s));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to toggle status');
    } finally {
      setTogglingId(null);
    }
  };

  const roleColors = {
    pharmacy_admin: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    pharmacist: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    assistant: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };

  return (
    <PageTransition className="p-4 md:p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-amber-400" />
            Staff Management
          </h1>
          <p className="text-slate-400 mt-1">Manage pharmacy team members and their access levels.</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)]">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Add Staff'}
        </button>
      </div>

      {/* Add Staff Form */}
      {showForm && (
        <div className="glass-panel p-6 rounded-2xl mb-8 border border-amber-500/20 bg-amber-500/5 max-w-lg">
          <h3 className="text-white font-bold mb-5 flex items-center gap-2"><UserCircle className="w-5 h-5 text-amber-400" /> New Team Member</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Full Name</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Dr. Jane Smith"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-amber-500 outline-none placeholder:text-slate-600 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Email Address</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="pharmacist@example.com"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-amber-500 outline-none placeholder:text-slate-600 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-amber-500 outline-none transition-colors">
                <option value="pharmacist">Pharmacist</option>
                <option value="assistant">Assistant</option>
                <option value="pharmacy_admin">Admin</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-1 text-xs text-slate-500">
              <Mail className="w-3.5 h-3.5" />
              A temporary password will be emailed to the new staff member.
            </div>
            <button type="submit" disabled={submitting}
              className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Adding...</> : <><Plus className="w-4 h-4" />Add & Send Invite</>}
            </button>
          </form>
        </div>
      )}

      {/* Staff Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-400">Loading staff...</p>
          </div>
        ) : staff.length > 0 ? (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-800/80 border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(member => (
                <tr key={member._id} className="border-b border-slate-800 hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {member.fullName?.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-white font-medium">{member.fullName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">{member.email}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${roleColors[member.role] || roleColors.assistant}`}>
                      <Shield className="w-3 h-3" />
                      {member.role?.replace('pharmacy_', '').replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {member.isActive ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold border border-emerald-500/25">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-700/50 text-slate-500 text-xs font-bold border border-slate-600/30">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleToggle(member._id, member.isActive)}
                      disabled={togglingId === member._id}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                        member.isActive
                          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                      }`}>
                      {togglingId === member._id ? <Loader2 className="w-3 h-3 animate-spin" /> : (member.isActive ? 'Deactivate' : 'Activate')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center text-slate-500">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No staff members found. Add your first team member above.</p>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   TAB: Settings (Profile pic and biography)
   ══════════════════════════════════════════════════════════════════════════════ */
const PharmacySettings = () => {
  const [profile, setProfile] = useState({ fullName: '', email: '', role: '', description: '', profilePicture: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);

  useEffect(() => {
    api.get('/pharmacy/staff/me')
      .then(res => {
        setProfile(res.data.data || {});
        setLoading(false);
      })
      .catch(() => {
        toast.error('Failed to load profile');
        setLoading(false);
      });
  }, []);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);

    setUploadingPic(true);
    const toastId = toast.loading('Uploading profile logo...');
    try {
      const res = await api.post('/users/upload-profile-pic', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setProfile(prev => ({ ...prev, profilePicture: res.data.imageUrl }));
      toast.update(toastId, { render: 'Profile picture updated!', type: 'success', isLoading: false, autoClose: 3000 });
    } catch (err) {
      toast.update(toastId, { render: err.response?.data?.error || 'Failed to upload picture', type: 'error', isLoading: false, autoClose: 3000 });
    } finally {
      setUploadingPic(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/users/profile', { description: profile.description });
      toast.success('Profile settings updated successfully');
    } catch (err) {
      toast.error('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-400">Loading settings...</p>
      </div>
    );
  }

  return (
    <PageTransition className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Pharmacy Settings</h1>
        <p className="text-slate-400 mt-1">Configure your pharmacy profile and description.</p>
      </div>
      <div className="glass-panel p-6 rounded-xl max-w-2xl">
        <form onSubmit={handleSave} className="space-y-6">
          {/* Logo Upload */}
          <div className="flex items-center gap-6 mb-6 pb-6 border-b border-slate-700/50">
            <div className="relative group w-24 h-24 rounded-2xl overflow-hidden bg-slate-800/80 border border-slate-700 flex items-center justify-center text-white text-xl font-bold">
              {profile.profilePicture ? (
                <img src={profile.profilePicture} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                profile.fullName?.charAt(0) || 'P'
              )}
              <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity duration-200">
                <Camera className="w-6 h-6 text-emerald-400" />
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handlePhotoUpload} 
                  className="hidden" 
                  disabled={uploadingPic} 
                />
              </label>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm">Pharmacy Profile Picture</h4>
              <p className="text-slate-500 text-xs mt-1">Visible to patients browsing directories. Max size 2MB.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
            <input type="text" value={profile.fullName || ''} disabled className="w-full bg-slate-800/30 border border-slate-800 rounded-lg px-4 py-2 text-slate-500 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Email Address</label>
            <input type="email" value={profile.email || ''} disabled className="w-full bg-slate-800/30 border border-slate-800 rounded-lg px-4 py-2 text-slate-500 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
            <input type="text" value={profile.role?.replace('_', ' ').toUpperCase() || ''} disabled className="w-full bg-slate-800/30 border border-slate-800 rounded-lg px-4 py-2 text-slate-500 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Pharmacy Biography / Description</label>
            <textarea value={profile.description || ''} onChange={e => setProfile({...profile, description: e.target.value})} rows={4} placeholder="Tell patients about your pharmacy, operating hours, and location specifics..." className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white resize-none focus:border-emerald-500 outline-none" />
          </div>
          <div className="pt-4">
            <button type="submit" disabled={saving} className="glass-button bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2 rounded-xl font-bold transition-all">
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </PageTransition>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   ROOT: PharmacyDashboard — Shell with Sidebar + Routes
   ══════════════════════════════════════════════════════════════════════════════ */
export default function PharmacyDashboard() {
  const role = getPharmacyRole();
  const isAdmin = role === 'pharmacy_admin';

  const menuItems = [
    { label: 'Dispense',    path: '/pharmacy/dashboard/dispense',  icon: Package },
    { label: 'Manual OTC',  path: '/pharmacy/dashboard/otc',       icon: ShoppingBag },
    { label: 'History',     path: '/pharmacy/dashboard/history',   icon: Clock },
    ...(isAdmin ? [
      { label: 'Restock ML',  path: '/pharmacy/dashboard/restock',   icon: Pill },
      { label: 'Analytics',   path: '/pharmacy/dashboard/analytics', icon: BarChart3 },
      { label: 'Staff',       path: '/pharmacy/dashboard/staff',     icon: Users }
    ] : []),
    { label: 'Settings',    path: '/pharmacy/dashboard/settings',  icon: Settings },
  ];

  const userName = localStorage.getItem('userName') || 'Pharmacy Staff';
  const rawRole = localStorage.getItem('role') || role;
  const displayRole = rawRole === 'pharmacy_admin' ? 'Pharmacy Admin' : 
                      rawRole === 'pharmacist' ? 'Staff Pharmacist' : 
                      rawRole.replace('_', ' ');

  return (
    <div className="pharmacy-theme flex flex-col min-h-screen bg-[#0b1120]">
      <ActiveOutbreakBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar menuItems={menuItems} title="Pharmacy Portal" themePrefix="pharmacy" userName={userName} userRole={displayRole} />
        <main className="flex-1 lg:ml-64 p-4 overflow-y-auto">
          <Routes>
            <Route path="/dashboard"                element={<Navigate to="/pharmacy/dashboard/dispense" replace />} />
            <Route path="/dashboard/dispense"       element={<Dispense />} />
            <Route path="/dashboard/otc"            element={<ManualDispenseOTC />} />
            <Route path="/dashboard/history"        element={<History />} />
            <Route path="/dashboard/restock"        element={<RestockPredictor />} />
            
            {isAdmin && (
              <>
                <Route path="/dashboard/analytics"      element={<RestockAnalytics />} />
                <Route path="/dashboard/staff"          element={<StaffManagement />} />
              </>
            )}
            <Route path="/dashboard/settings"       element={<PharmacySettings />} />
            <Route path="*" element={<Navigate to="/pharmacy/dashboard/dispense" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}