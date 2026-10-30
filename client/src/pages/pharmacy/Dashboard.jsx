import LanguagePreferenceCard from '../../components/common/LanguagePreferenceCard';
import PatientAccessModal from '../../components/PatientAccessModal';
import { PatientAccessProvider, usePatientAccess } from '../../context/PatientAccessContext';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Package, Clock, Search, CheckCircle, Pill, ShoppingBag,
  Plus, Trash2, Loader2, Users, BarChart3, UserCircle, Shield, Mail,
  AlertTriangle, RefreshCw, Activity, X, Settings, Camera,
  Key, Printer, Save
} from 'lucide-react';
import api from '../../api/axiosInstance';
import { useTranslation } from '../../i18n/LanguageContext';
import AppShell from '../../components/ui/AppShell';
import Skeleton from '../../components/ui/Skeleton';
import PageTransition from '../../components/common/PageTransition';
import ActiveOutbreakBanner from '../../components/common/ActiveOutbreakBanner';
import Modal from '../../components/ui/Modal';
import ChangePasswordCard from '../../components/common/ChangePasswordCard';
import { formatDoctorName } from '../../utils/doctorName';

const labelClass = 'block text-xs font-semibold uppercase text-slate-400 mb-1.5';
const requiresPatientConsent = error => error.response?.status === 403 &&
  (error.response?.data?.error === 'Patient consent required' || error.response?.data?.requiresPatientAccess === true);

function getPharmacyRole() {
  return localStorage.getItem('role') || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Dispense Medication
// ─────────────────────────────────────────────────────────────────────────────
const Dispense = () => {
  const { t } = useTranslation();
  const [nic, setNic] = useState('');
  const [prescriptions, setPrescriptions] = useState([]);
  const [patientInfo, setPatientInfo] = useState(null);
  const [loadedNic, setLoadedNic] = useState('');
  const [loading, setLoading] = useState(false);
  const [dispensing, setDispensing] = useState(false);
  const searchGeneration = useRef(0);
  
  // Alternative dispense modal states
  const [showDispenseModal, setShowDispenseModal] = useState(false);
  const [selectedRx, setSelectedRx] = useState(null);
  const [isAlt, setIsAlt] = useState(false);
  const [altDetails, setAltDetails] = useState('');
  const [inventory, setInventory] = useState([]);
  const [dispenseItems, setDispenseItems] = useState([]);
  const [checkoutKey, setCheckoutKey] = useState('');
  const { setPatientSession, getPatientToken } = usePatientAccess();
  const [showConsentModal, setShowConsentModal] = useState(false);

  const changePatientNic = useCallback(value => {
    searchGeneration.current += 1;
    setNic(value);
    setLoading(false);
    setPatientInfo(null);
    setPrescriptions([]);
    setLoadedNic('');
    setShowConsentModal(false);
    setShowDispenseModal(false);
    setSelectedRx(null);
  }, []);

  useEffect(() => {
    const clear = () => changePatientNic('');
    window.addEventListener('medisync:session-cleared', clear);
    return () => {
      searchGeneration.current += 1;
      window.removeEventListener('medisync:session-cleared', clear);
    };
  }, [changePatientNic]);

  const handleSearch = async (e, forcedToken) => {
    if (e && e.preventDefault) e.preventDefault();
    const lookupNic = nic.trim().toUpperCase();
    if (!lookupNic) return toast.error('Enter Patient NIC');
    const generation = ++searchGeneration.current;
    setLoading(true);
    setPatientInfo(null);
    setPrescriptions([]);
    setLoadedNic('');
    setShowConsentModal(false);
    const patientToken = forcedToken || (getPatientToken ? getPatientToken(lookupNic) : null);
    try {
      const headers = patientToken ? { 'x-patient-access': patientToken } : {};
      const { data } = await api.get(`/pharmacy/prescriptions/pending/${encodeURIComponent(lookupNic)}`, { headers });
      if (generation !== searchGeneration.current) return;
      if (Array.isArray(data?.data?.prescriptions)) {
        setPrescriptions(data.data.prescriptions);
        setPatientInfo(data.data.patient);
        setLoadedNic(lookupNic);
        if (data.data.prescriptions.length === 0) toast.info('No pending prescriptions found for this NIC.');
      } else if (Array.isArray(data?.data)) {
        setPrescriptions(data.data);
        setPatientInfo(null);
        setLoadedNic(lookupNic);
        if (data.data.length === 0) toast.info('No pending prescriptions found for this NIC.');
      } else {
        toast.error('Invalid prescription response. Please retry.');
      }
    } catch (err) {
      if (generation !== searchGeneration.current) return;
      if (requiresPatientConsent(err)) {
        setShowConsentModal(true);
      } else {
        toast.error(err.response?.data?.error || 'Failed to fetch prescriptions');
      }
    } finally {
      if (generation === searchGeneration.current) setLoading(false);
    }
  };

  const openDispenseModal = async (rx) => {
    const generation = searchGeneration.current;
    try {
      const { data } = await api.get('/pharmacy/inventory');
      if (generation !== searchGeneration.current) return;
      const stock = data.data || [];
      setInventory(stock);
      const meds = rx.medications?.length ? rx.medications : [{ name: rx.drugName }];
      setDispenseItems(meds.map(m => {
        const matches = stock.filter(i => i.drugName.trim().toLowerCase() === m.name.trim().toLowerCase());
        return { prescribed: m.name, inventoryItemId: matches.length === 1 ? matches[0]._id : '', quantity: '' };
      }));
      setCheckoutKey(`rx:${rx._id || rx.prescriptionId}`);
      setIsAlt(false); setAltDetails(''); setSelectedRx(rx); setShowDispenseModal(true);
    } catch (_) { toast.error('Cannot load pharmacy inventory.'); }
  };

  const confirmDispense = async () => {
    if (!selectedRx) return;
    if (isAlt && !altDetails.trim()) return toast.error('Please describe the alternative medication dispensed.');
    const items = dispenseItems.map(item => {
      const inv = inventory.find(i => i._id === item.inventoryItemId);
      return { inventoryItemId: inv?._id, drugName: inv?.drugName, unit: inv?.unit, quantityDispensed: Number(item.quantity) };
    });
    if (items.some(i => !i.inventoryItemId || !Number.isSafeInteger(i.quantityDispensed) || i.quantityDispensed <= 0)) return toast.error('Select inventory and enter a positive whole quantity for every medicine.');
    setDispensing(true);
    try {
      const patientToken = getPatientToken ? getPatientToken(selectedRx.patientNic) : null;
      await api.post('/pharmacy/dispense', {
        prescriptionId: selectedRx.prescriptionId,
        patientNic: selectedRx.patientNic,
        items,
        isAlternativeDispensed: isAlt,
        alternativeDetails: isAlt ? altDetails.trim() : undefined,
      }, { headers: { 'Idempotency-Key': checkoutKey, ...(patientToken ? { 'x-patient-access': patientToken } : {}) } });
      toast.success('Prescription dispensing recorded.');
      setPrescriptions(prev => prev.filter(p => p.prescriptionId !== selectedRx.prescriptionId));
      setShowDispenseModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to dispense');
    } finally {
      setDispensing(false);
    }
  };

  return (
    <PageTransition className="space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">{t("pharmacy.dispense", "Dispense Medication")}</h1>
        <p className="text-slate-400 mt-1 text-sm font-medium">{t("pharmacy.dispenseSubtitle", "Verify patient NIC, fetch e-prescriptions, and log clinical dispensations.")}</p>
      </div>

      <div className="glass-panel p-6 rounded-2xl border border-white/5 max-w-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-[0.02] pointer-events-none">
          <Search className="w-32 h-32 text-teal-400" />
        </div>
        <form onSubmit={handleSearch} className="relative z-10 flex gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={nic}
              aria-label="Patient NIC"
              onChange={(e) => changePatientNic(e.target.value)}
              placeholder="Enter Patient NIC (e.g. 981234567V)"
              className="glass-input py-3.5 px-4 text-base uppercase"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="glass-button text-xs py-3 px-6 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 text-white shrink-0 disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Retrieve
          </button>
        </form>
      </div>

      {patientInfo && (
        <div className="glass-panel p-5 rounded-xl border border-teal-500/10 flex flex-col md:flex-row gap-5 items-center bg-teal-500/5 select-none">
          <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
            <UserCircle className="w-6 h-6 text-teal-400" />
          </div>
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 w-full text-xs font-semibold">
            <div>
              <p className="text-slate-500 uppercase tracking-wider mb-1">{t("patient.fullName", "Patient Name")}</p>
              <p className="text-slate-200 text-sm truncate">{patientInfo.fullName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-slate-500 uppercase tracking-wider mb-1">{t("patient.contactInfo", "Contact No")}</p>
              <p className="text-slate-200 text-sm truncate">{patientInfo.contactInfo || 'N/A'}</p>
            </div>
            <div>
              <p className="text-slate-500 uppercase tracking-wider mb-1">{t("patient.bloodGroup", "Blood Group")}</p>
              <p className="text-red-400 text-sm">{patientInfo.bloodGroup || 'N/A'}</p>
            </div>
            <div>
              <p className="text-slate-500 uppercase tracking-wider mb-1">{t("patient.dob", "Date of Birth")}</p>
              <p className="text-slate-300 text-sm">{patientInfo.dateOfBirth ? new Date(patientInfo.dateOfBirth).toLocaleDateString() : 'N/A'}</p>
            </div>
          </div>
        </div>
      )}

      {prescriptions.length > 0 && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
          <div className="p-5 bg-slate-900/60 border-b border-white/5 flex justify-between items-center select-none">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Pill className="w-4 h-4 text-teal-400 animate-pulse-subtle" /> Active Prescriptions for NIC: {loadedNic}
            </h2>
            <span className="text-xs font-mono font-bold text-teal-400">{prescriptions.length} items</span>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {prescriptions.map((rx) => {
              const mainDrug = rx.medications && rx.medications.length > 0 ? rx.medications[0] : null;
              return (
                <div key={rx._id} className="bg-slate-950/40 border border-white/5 p-5 rounded-2xl flex flex-col justify-between hover:border-teal-500/20 transition-all">
                  <div>
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <h3 className="text-base font-bold text-white truncate">{mainDrug?.name || rx.drugName || 'Medication'}</h3>
                      <span className="px-2 py-0.5 bg-teal-500/10 border border-teal-500/20 text-teal-400 text-[10px] font-mono font-bold rounded">
                        #{rx.prescriptionId?.split('-')[1] || rx.prescriptionId}
                      </span>
                    </div>
                    {mainDrug && (
                      <div className="space-y-1.5 mb-4 text-xs text-slate-300 font-semibold pt-1">
                        <p><span className="text-slate-500 w-16 inline-block uppercase tracking-wider">{t("pharmacy.dosageLabel", "Dosage:")}</span> {mainDrug.dosage}</p>
                        <p><span className="text-slate-500 w-16 inline-block uppercase tracking-wider">{t("pharmacy.frequencyLabel", "Frequency:")}</span> {mainDrug.frequency}</p>
                        <p><span className="text-slate-500 w-16 inline-block uppercase tracking-wider">{t("pharmacy.durationLabel", "Duration:")}</span> {mainDrug.durationDays} Days</p>
                      </div>
                    )}
                    <p className="text-xs text-slate-500 mb-4 border-t border-white/5 pt-3 select-none">
                      Referred by <span className="text-slate-300 font-bold">{formatDoctorName(rx.doctorId?.fullName, 'Practitioner')}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => openDispenseModal(rx)}
                    className="w-full py-2.5 bg-teal-600/10 border border-teal-500/25 hover:bg-teal-600 text-teal-400 hover:text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" /> Dispense Medication
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alternative Dispense Modal */}
      <Modal
        isOpen={showDispenseModal}
        onClose={() => setShowDispenseModal(false)}
        title="Dispense Verification Approval"
        size="sm"
      >
        {selectedRx && (
          <div className="space-y-5">
            <div className="text-center md:text-left select-none">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">{t("pharmacy.drugName", "Medication Name")}</span>
              <span className="text-white font-bold text-sm">{selectedRx.medications?.[0]?.name || selectedRx.drugName}</span>
            </div>

            {dispenseItems.map((item, index) => (
              <div key={index} className="space-y-2">
                <label className={labelClass} htmlFor={`stock-${index}`}>Inventory for {item.prescribed}</label>
                <select id={`stock-${index}`} className="glass-input w-full" value={item.inventoryItemId}
                  disabled={dispensing} onChange={e => setDispenseItems(prev => prev.map((m, i) => i === index ? {...m, inventoryItemId:e.target.value} : m))}>
                  <option value="">{t("pharmacy.selectMedicine", "Select medicine")}</option>
                  {inventory.filter(i => isAlt || i.drugName.trim().toLowerCase() === item.prescribed.trim().toLowerCase()).map(i => <option key={i._id} value={i._id}>{i.drugName} — {i.stock} {i.unit}</option>)}
                </select>
                <label className={labelClass} htmlFor={`qty-${index}`}>{t("pharmacy.quantity", "Quantity in inventory units")}</label>
                <input id={`qty-${index}`} type="number" min="1" step="1" className="glass-input w-full" value={item.quantity}
                  disabled={dispensing} onChange={e => setDispenseItems(prev => prev.map((m, i) => i === index ? {...m, quantity:e.target.value} : m))} />
              </div>
            ))}

            {/* Alternative Toggle Box */}
            <label className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 cursor-pointer hover:bg-amber-500/10 transition-all select-none">
              <input
                type="checkbox"
                checked={isAlt}
                onChange={e => setIsAlt(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-amber-400 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-amber-400 font-bold text-xs">{t("pharmacy.brandSubstitute", "Dispense Brand Substitute / Alternative")}</p>
                <p className="text-slate-500 text-[10px] mt-1 leading-normal">{t("pharmacy.substituteHelp", "Select if dispensing a generic alternative different from prescription.")}</p>
              </div>
            </label>

            {isAlt && (
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Substitution Justification Notes *</label>
                <input
                  type="text"
                  value={altDetails}
                  onChange={e => setAltDetails(e.target.value)}
                  placeholder="e.g. Calpol 500mg instead of Panadol"
                  className="glass-input text-xs"
                  autoFocus
                />
              </div>
            )}

            <div className="flex gap-3 pt-3 border-t border-white/5">
              <button
                onClick={() => setShowDispenseModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/5 text-slate-400 hover:text-white text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmDispense}
                disabled={dispensing || (isAlt && !altDetails.trim())}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {dispensing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Dispense Now
              </button>
            </div>
          </div>
        )}
      </Modal>
      {showConsentModal && (
        <PatientAccessModal
          patientNic={nic.trim().toUpperCase()}
          requesterName={localStorage.getItem('userName') || 'Staff Pharmacist'}
          requesterRole="pharmacist"
          onSuccess={(token) => {
            if (setPatientSession) setPatientSession({ nic: nic.trim().toUpperCase(), token });
            setShowConsentModal(false);
            handleSearch(null, token);
          }}
          onClose={() => setShowConsentModal(false)}
        />
      )}
    </PageTransition>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Dispensing History Log
// ─────────────────────────────────────────────────────────────────────────────
const History = () => {
  const { t } = useTranslation();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/pharmacy/history').then(res => {
      setHistory(res.data.data || []);
      setLoading(false);
    }).catch(() => {
      toast.error('Failed to load history logs');
      setLoading(false);
    });
  }, []);

  return (
    <PageTransition className="space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">{t("pharmacy.history", "Dispensing History")}</h1>
        <p className="text-slate-400 mt-1 text-sm font-medium">{t("pharmacy.auditSubtitle", "Review medication logs and patient receipts issued from this facility.")}</p>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        {loading ? (
          <div className="p-8"><Skeleton.Card /></div>
        ) : history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/60 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">{t("pharmacy.receiptNo", "Receipt Number")}</th>
                  <th className="px-6 py-4">{t("pharmacy.patientNic", "Patient NIC")}</th>
                  <th className="px-6 py-4">{t("common.medications", "Medications")}</th>
                  <th className="px-6 py-4">{t("pharmacy.dispensedBy", "Dispensed By")}</th>
                  <th className="px-6 py-4 text-right">{t("common.timestamp", "Timestamp")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                {history.map(record => {
                  const drugLabel = record.prescriptionId?.medications?.length > 0
                    ? record.prescriptionId.medications.map(m => m.name).join(', ')
                    : (record.items?.[0]?.drugName || record.prescriptionId?.drugName || '—');
                  return (
                    <tr key={record._id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-white text-xs">{record.receiptNumber || '—'}</td>
                      <td className="px-6 py-4 font-mono text-slate-300 text-xs">{record.patientNic || '—'}</td>
                      <td className="px-6 py-4 text-slate-300 text-xs font-medium max-w-[200px] truncate" title={drugLabel}>{drugLabel}</td>
                      <td className="px-6 py-4 text-slate-400 font-bold">{record.staffId?.fullName || '—'}</td>
                      <td className="px-6 py-4 text-slate-500 font-mono text-xs text-right">{new Date(record.createdAt).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 select-none">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-semibold">{t("pharmacy.noDispenseEvents", "No dispensing events found in system logs.")}</p>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Manual OTC Dispensing (Checkout shopping cart & invoice print)
// ─────────────────────────────────────────────────────────────────────────────
const emptyMed = () => ({ inventoryItemId: '', name: '', dosage: '', frequency: '', qty: 1, unit: '' });

const ManualDispenseOTC = () => {
  const { t } = useTranslation();
  const [patientNic, setPatientNic] = useState('');
  const [consultationRef, setConsultationRef] = useState('');
  const [medications, setMedications] = useState([emptyMed()]);
  const [availableStock, setAvailableStock] = useState([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);
  const { setPatientSession, getPatientToken } = usePatientAccess();
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [otcKey, setOtcKey] = useState(() => {
    const existing = sessionStorage.getItem('medisync:otc-checkout');
    const key = existing || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    sessionStorage.setItem('medisync:otc-checkout', key);
    return key;
  });
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  useEffect(() => {
    let isMounted = true;
    api.get('/pharmacy/inventory')
      .then(res => {
        if (isMounted) setAvailableStock(res.data?.data || []);
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const updateMed = (index, field, value) =>
    setMedications(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));

  const validMeds = useMemo(() => {
    return medications
      .filter(m => m.name.trim())
      .map(m => {
        const raw = typeof m.qty === 'string' ? m.qty.trim() : (m.qty !== undefined && m.qty !== null ? String(m.qty).trim() : '');
        const isStrictPositiveInt = /^[1-9]\d*$/.test(raw);
        const parsed = isStrictPositiveInt ? Number(raw) : null;
        const validQty = (parsed !== null && Number.isSafeInteger(parsed) && parsed > 0) ? parsed : null;
        return {
          name: m.name.trim(),
          dosage: m.dosage ? m.dosage.trim() : undefined,
          qty: validQty,
          inventoryItemId: m.inventoryItemId || undefined,
          unit: m.unit || undefined
        };
      });
  }, [medications]);

  const totalQuantity = useMemo(() => {
    return validMeds.reduce((acc, m) => acc + (m.qty || 0), 0);
  }, [validMeds]);

  const executeDispense = async (forcedToken) => {
    const normalizedNic = patientNic.trim().toUpperCase();
    if (!normalizedNic) return toast.error(t('pharmacy.nicRequired', 'Patient NIC is required.'));
    if (validMeds.length === 0) return toast.error(t('pharmacy.medRequired', 'At least one medication name is required.'));
    if (validMeds.some(m => !m.qty || m.qty <= 0)) {
      return toast.error(t('pharmacy.positiveQtyRequired', 'Enter an exact positive whole integer quantity for every medication.'));
    }

    const token = forcedToken || (getPatientToken ? getPatientToken(normalizedNic) : null);
    if (!token) {
      setShowConsentModal(true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/pharmacy/dispense-otc', {
        patientNic: normalizedNic,
        consultationRef: consultationRef.trim() || undefined,
        medications: validMeds,
        notes: notes.trim(),
      }, {
        headers: {
          'Idempotency-Key': otcKey,
          'x-patient-access': token
        }
      });

      const responseData = res?.data?.data;
      if (!responseData?.receiptNumber) {
        toast.error(t('pharmacy.unconfirmedResponse', 'Dispensing completed but no valid receipt acknowledgement was returned.'));
        return;
      }

      toast.success(t('pharmacy.otcSuccess', 'OTC dispensation recorded successfully.'));
      const nextKey = crypto.randomUUID();
      sessionStorage.setItem('medisync:otc-checkout', nextKey);
      setOtcKey(nextKey);

      setLastReceipt({
        receiptNumber: responseData.receiptNumber,
        prescriptionId: responseData.prescriptionId || null,
        medicationCount: responseData.medicationCount || validMeds.length,
        issuedAt: responseData.issuedAt || null,
        replayed: Boolean(res?.data?.replayed),
        medications: validMeds
      });

      setShowReceiptModal(true);
      setPatientNic('');
      setConsultationRef('');
      setMedications([emptyMed()]);
      setNotes('');
    } catch (err) {
      if (requiresPatientConsent(err)) {
        setShowConsentModal(true);
      } else {
        toast.error(err.response?.data?.error || t('pharmacy.otcFailed', 'OTC dispensing failed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executeDispense();
  };

  return (
<PageTransition className="space-y-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">{t("pharmacy.manualOtc", "Manual OTC Checkout")}</h1>
          <p className="text-slate-400 mt-1 text-sm font-medium">{t("pharmacy.otcSubtitle", "Record direct over-the-counter checkouts and generate simulated receipts.")}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid lg:grid-cols-3 gap-6 items-start">
        {/* Left Form Area */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6 rounded-2xl space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="otc-patient-nic">Patient NIC *</label>
              <input
                id="otc-patient-nic"
                type="text"
                value={patientNic}
                onChange={e => setPatientNic(e.target.value)}
                placeholder="e.g. 981234567V"
                className="glass-input text-sm uppercase"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t("pharmacy.consultationRefOptional", "Consultation Reference (optional)")}</label>
              <input
                type="text"
                value={consultationRef}
                onChange={e => setConsultationRef(e.target.value)}
                placeholder="e.g. CON-842918"
                className="glass-input text-sm uppercase"
              />
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3 select-none">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t("pharmacy.medicationsCart", "Medications Shopping Cart")}</label>
              <button
                type="button"
                onClick={() => setMedications(prev => [...prev, emptyMed()])}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400 text-[11px] font-bold hover:bg-teal-500/20 transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> Add Drug
              </button>
            </div>

            <datalist id="drug-suggestions">
              {availableStock.length > 0 ? (
                availableStock.map(item => (
                  <option
                    key={item._id || item.drugName + (item.batchNumber || '')}
                    value={item.drugName}
                    label={`${item.drugName} (Batch: ${item.batchNumber || 'STD'}, Stock: ${item.quantity ?? item.stock ?? 0})`}
                  />
                ))
              ) : (
                [
                  'Paracetamol 500mg','Panadol 500mg','Calpol 500mg',
                  'Amoxicillin 250mg','Amoxicillin 500mg','Amoxiclav 625mg',
                  'Ibuprofen 200mg','Ibuprofen 400mg',
                  'Cetirizine 10mg','Piriton 4mg','Loratadine 10mg',
                  'Metformin 500mg','Amlodipine 5mg','Omeprazole 20mg'
                ].map(d => <option key={d} value={d} />)
              )}
            </datalist>

            <div className="space-y-3">
              {medications.map((med, idx) => (
                <div key={idx} className="flex gap-3 bg-slate-950/30 rounded-xl p-4 border border-white/5 relative items-center">
                  <span className="text-slate-500 text-xs font-mono font-bold w-5 shrink-0 text-center">{idx + 1}</span>
                  <div className="grid grid-cols-12 gap-3 flex-1">
                    <select
                      value={med.inventoryItemId || ''}
                      onChange={e => {
                        const chosenId = e.target.value;
                        const item = availableStock.find(i => String(i._id) === chosenId);
                        if (item) {
                          updateMed(idx, 'inventoryItemId', item._id);
                          updateMed(idx, 'name', item.drugName);
                          updateMed(idx, 'dosage', item.dosage || med.dosage || '');
                          updateMed(idx, 'unit', item.unit || 'unit');
                        } else {
                          updateMed(idx, 'inventoryItemId', '');
                        }
                      }}
                      className="col-span-12 sm:col-span-4 glass-card rounded-lg px-2.5 py-2 text-white text-xs focus:border-teal-500 outline-none"
                    >
                      <option value="" className="bg-slate-900 text-slate-400">Select Stock Drug...</option>
                      {availableStock.map(i => (
                        <option key={i._id} value={i._id} className="bg-slate-900 text-white">
                          {i.drugName} (Stock: {i.quantity ?? i.stock ?? 0} {i.unit || 'units'})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      list="drug-suggestions"
                      value={med.name}
                      onChange={e => {
                        const val = e.target.value;
                        updateMed(idx, 'name', val);
                        const match = availableStock.filter(i => i.drugName.toLowerCase() === val.trim().toLowerCase());
                        if (match.length === 1) {
                          updateMed(idx, 'inventoryItemId', match[0]._id);
                          updateMed(idx, 'unit', match[0].unit || 'unit');
                        } else {
                          updateMed(idx, 'inventoryItemId', '');
                        }
                      }}
                      placeholder="Medication name* (select stock or type)"
                      className="col-span-12 sm:col-span-4 glass-card rounded-lg px-3 py-2 text-white text-xs focus:border-teal-500 outline-none"
                    />
                    <input
                      type="text"
                      value={med.dosage}
                      onChange={e => updateMed(idx, 'dosage', e.target.value)}
                      placeholder="Dosage (500mg)"
                      className="col-span-6 sm:col-span-2 glass-card rounded-lg px-3 py-2 text-white text-xs focus:border-teal-500 outline-none"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={med.qty ?? ''}
                      onChange={e => updateMed(idx, 'qty', e.target.value)}
                      placeholder="Qty"
                      className="col-span-6 sm:col-span-1 glass-card rounded-lg px-3 py-2 text-white text-xs focus:border-teal-500 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => { if (medications.length > 1) setMedications(prev => prev.filter((_, i) => i !== idx)); }}
                      disabled={medications.length === 1}
                      className="col-span-12 sm:col-span-1 py-2 flex items-center justify-center text-red-400/60 hover:text-red-400 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/20 rounded-lg disabled:opacity-20"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right dispensing summary panel */}
        <div className="space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4 select-none">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5 pb-2">Clinical Order Summary</h4>
            <div className="space-y-2 text-xs font-semibold text-slate-300">
              <div className="flex justify-between">
                <span>Patient NIC:</span>
                <span className="font-mono text-slate-200">{patientNic.trim().toUpperCase() || 'Pending'}</span>
              </div>
              <div className="flex justify-between">
                <span>Medication Lines:</span>
                <span className="font-mono text-slate-200">{validMeds.length} line(s)</span>
              </div>
              <div className="flex justify-between">
                <span>Total Units:</span>
                <span className="font-mono text-teal-400">{totalQuantity} units</span>
              </div>
              <div className="h-px bg-white/5 my-2" />
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Idempotency Key:</span>
                <span className="font-mono">{otcKey.slice(0, 12)}...</span>
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingBag className="w-4 h-4" />}
              Fulfill Dispensation
            </button>
          </div>
        </div>
      </form>

      {/* Dispensed medication fulfillment confirmation modal */}
      <Modal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        title={t('pharmacy.dispensedReceiptTitle', 'Dispensed Medication Fulfillment Record')}
        size="sm"
      >
        {lastReceipt && (
          <div className="space-y-5 select-none text-xs">
            <div className="text-center py-2 border-b border-dashed border-white/10">
              <p className="text-white font-black text-sm uppercase">MEDISYNC PHARMACY</p>
              <p className="text-slate-500 mt-0.5">Clinical Dispensation Fulfillment</p>
            </div>
            
            <div className="space-y-1 font-mono text-slate-400">
              <p>Receipt Number: <span className="text-white font-bold">{lastReceipt.receiptNumber}</span></p>
              {lastReceipt.prescriptionId && <p>Prescription Ref: {lastReceipt.prescriptionId}</p>}
              {lastReceipt.issuedAt && <p>Issued At: {lastReceipt.issuedAt}</p>}
              {lastReceipt.replayed && <p className="text-amber-400 font-bold">[Replayed Idempotent Response]</p>}
            </div>

            <div className="h-px bg-white/5" />

            <div className="space-y-2">
              <p className="font-bold text-white uppercase tracking-wider text-[10px] text-slate-500">Fulfilled Medications</p>
              {lastReceipt.medications?.map((m, i) => (
                <div key={i} className="flex justify-between font-mono text-slate-300">
                  <span>{m.name} {m.dosage ? `(${m.dosage})` : ''}</span>
                  <span className="text-teal-400 font-bold">Qty: {m.qty || 1} {m.unit || ''}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-white/10 pt-3 space-y-1.5 font-mono text-slate-300">
              <div className="flex justify-between font-bold text-white text-xs">
                <span>TRANSACTION STATUS:</span>
                <span className="text-emerald-400">COMMITTED</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>MEDICATION LINES DISPENSED:</span>
                <span>{lastReceipt.medicationCount ?? lastReceipt.medications?.length ?? 0} LINES</span>
              </div>
            </div>

            <div className="flex gap-2 pt-3 border-t border-white/5">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold flex items-center justify-center gap-1.5 border border-white/5"
              >
                <Printer className="w-3.5 h-3.5" /> Print Dispensing Record
              </button>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="flex-1 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
          {showConsentModal && (
        <PatientAccessModal
          patientNic={patientNic.trim().toUpperCase()}
          requesterName={localStorage.getItem('userName') || 'Staff Pharmacist'}
          requesterRole="pharmacist"
          onSuccess={(token) => {
            const normalizedNic = patientNic.trim().toUpperCase();
            if (setPatientSession) setPatientSession({ nic: normalizedNic, token });
            setShowConsentModal(false);
            executeDispense(token);
          }}
          onClose={() => setShowConsentModal(false)}
        />
      )}
    </PageTransition>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Restock Leaderboard Analytics
// ─────────────────────────────────────────────────────────────────────────────
const RestockAnalytics = () => {
  const { t } = useTranslation();
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
    <PageTransition className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-indigo-400 animate-pulse-subtle" />
            Restock Depletion Analytics
          </h1>
          <p className="text-slate-400 mt-1 text-sm font-medium">Fastest-depleting medications at {meta.pharmacyName || 'your pharmacy'} in the last 24 hours.</p>
        </div>
        <button
          onClick={fetchData}
          className="glass-button text-xs py-2 px-4 flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-panel p-5 rounded-2xl border border-white/5">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Active Inventory Analyzed</span>
            <span className="text-2xl font-black text-white mt-1 block font-mono">{meta.drugsAnalyzed || 0}</span>
          </div>
          <div className="glass-panel p-5 rounded-2xl border border-red-500/10">
            <span className="text-[10px] text-red-400/80 uppercase font-bold tracking-wider">Critical Inventory Alerts</span>
            <span className="text-2xl font-black text-red-400 mt-1 block font-mono">{leaderboard.filter(r => r.isCritical).length}</span>
          </div>
          <div className="glass-panel p-5 rounded-2xl border border-teal-500/10">
            <span className="text-[10px] text-teal-400/80 uppercase font-bold tracking-wider">Total Dispensed Units</span>
            <span className="text-2xl font-black text-teal-400 mt-1 block font-mono">
              {leaderboard.reduce((sum, r) => sum + r.totalDispensed24h, 0)}
            </span>
          </div>
        </div>
      )}

      {loading && <Skeleton.Card />}

      {error && (
        <div className="glass-panel rounded-2xl p-8 border border-red-500/20 bg-red-500/5 text-center space-y-4 select-none">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-red-400 font-bold">Failed to load analytics dashboard.</p>
          <button onClick={fetchData} className="glass-button text-xs py-2 px-6 mx-auto">Retry</button>
        </div>
      )}

      {!loading && !error && leaderboard.length === 0 && (
        <div className="glass-panel rounded-2xl p-12 text-center border border-white/5 select-none">
          <Activity className="w-12 h-12 text-slate-600 mx-auto mb-4 opacity-50" />
          <p className="text-slate-400 font-semibold text-lg">No dispensing logs in the last 24 hours</p>
        </div>
      )}

      {!loading && !error && leaderboard.length > 0 && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-900/60 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Rank</th>
                <th className="px-6 py-4">{t("pharmacy.drugName", "Medication Name")}</th>
                <th className="px-6 py-4 text-center">Dispensed (24h)</th>
                <th className="px-6 py-4 text-center">Current Stock</th>
                <th className="px-6 py-4">Depletion Level</th>
                <th className="px-6 py-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm text-slate-200">
              {leaderboard.map((row) => {
                const barWidth = Math.round((row.totalDispensed24h / maxDispensed) * 100);
                const isLow = row.isCritical;
                const stockDisplay = row.currentStock !== null ? `${row.currentStock} ${row.unit}` : '—';
                return (
                  <tr key={row.rank} className={isLow ? 'bg-red-500/[0.02] hover:bg-red-500/[0.04]' : 'hover:bg-white/[0.01]'}>
                    <td className="px-6 py-4 font-bold text-slate-400">#{row.rank}</td>
                    <td className="px-6 py-4 font-bold text-white">{row.drugName}</td>
                    <td className="px-6 py-4 text-center font-mono font-bold text-indigo-400">{row.totalDispensed24h}</td>
                    <td className="px-6 py-4 text-center font-mono font-semibold">
                      <span className={isLow ? 'text-red-400' : 'text-slate-300'}>{stockDisplay}</span>
                      {row.reorderLevel !== null && (
                        <span className="text-[10px] text-slate-600 block font-normal">Reorder @ {row.reorderLevel}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-900 h-1.5 rounded-full overflow-hidden border border-white/5">
                          <div
                            className={`h-full rounded-full transition-all ${isLow ? 'bg-red-400' : 'bg-indigo-400'}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-10 text-right font-mono font-semibold">
                          {row.percentDepleted !== null ? `${row.percentDepleted}%` : '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase select-none">
                          Critical
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-bold uppercase select-none">
                          Stable
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

// ─────────────────────────────────────────────────────────────────────────────
// TAB: District Restock Alerts (ML Predictor)
// ─────────────────────────────────────────────────────────────────────────────
const RestockPredictor = () => {
  const { t } = useTranslation();
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
    if (status === 'Critical') return { border: 'border-red-500/20', bg: 'bg-red-500/[0.02]', badge: 'bg-red-500/10 text-red-400 border-red-500/20', icon: '🚨', trend: 'text-red-400' };
    return { border: 'border-amber-500/20', bg: 'bg-amber-500/[0.02]', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: '⚠️', trend: 'text-amber-400' };
  };

  return (
    <PageTransition className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">{t('pharmacy.restockAlertsTitle', 'District Restock Alerts')}</h1>
          <p className="text-slate-400 mt-1 text-sm font-medium">ML demand analysis mapping regional pharmacy trends in {district || 'your district'}.</p>
        </div>
        <button onClick={fetchAlerts} className="glass-button text-xs py-2 px-4 flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-panel p-5 rounded-2xl border border-white/5">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Medicines Analyzed</span>
            <span className="text-2xl font-black text-white mt-1 block font-mono">{data?.drugsAnalyzed || 0}</span>
          </div>
          <div className="glass-panel p-5 rounded-2xl border border-red-500/10">
            <span className="text-[10px] text-red-400/80 uppercase font-bold tracking-wider">Critical ML Alerts</span>
            <span className="text-2xl font-black text-red-400 mt-1 block font-mono">{alerts.filter(a => a.status === 'Critical').length}</span>
          </div>
          <div className="glass-panel p-5 rounded-2xl border border-amber-500/10">
            <span className="text-[10px] text-amber-400/80 uppercase font-bold tracking-wider">Warnings Issued</span>
            <span className="text-2xl font-black text-amber-400 mt-1 block font-mono">{alerts.filter(a => a.status === 'Warning').length}</span>
          </div>
        </div>
      )}

      {isLoading && <Skeleton.Card />}
      
      {isError && (
        <div className="glass-panel rounded-2xl p-8 border border-red-500/25 bg-red-500/5 text-center space-y-4 select-none">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-red-400 font-bold">Failed to connect to ML restock engine.</p>
          <button onClick={fetchAlerts} className="glass-button text-xs py-2.5 px-6 mx-auto">Retry Engine</button>
        </div>
      )}

      {!isLoading && !isError && alerts.length === 0 && (
        <div className="glass-panel rounded-2xl p-12 text-center border border-teal-500/10 bg-teal-500/5 select-none">
          <CheckCircle className="w-10 h-10 text-teal-400 mx-auto mb-4" />
          <p className="text-teal-400 font-bold text-lg">Inventory levels are stable</p>
          <p className="text-slate-400 text-xs mt-1">No significant regional demand spikes detected in {district} over the past 14 days.</p>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="space-y-4">
          {alerts.map((alert, idx) => {
            const styles = getStatusStyles(alert.status);
            return (
              <div key={idx} className={`rounded-2xl border p-5 ${styles.border} ${styles.bg} flex items-start gap-4 hover:border-white/10 transition-all`}>
                <span className="text-2xl shrink-0 select-none">{styles.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-base font-bold text-white truncate">{alert.drugName}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${styles.badge}`}>{alert.status}</span>
                    <span className={`text-xs font-mono font-bold ${styles.trend}`}>{alert.trend}</span>
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">{alert.message}</p>
                  <div className="mt-3 flex gap-6 text-[10px] text-slate-500 border-t border-white/5 pt-2 select-none">
                    <span>Baseline: <span className="text-slate-400 font-bold">{alert.baselineDailyAvg} units/day</span></span>
                    <span>Recent demand: <span className="text-slate-400 font-bold">{alert.recentDailyAvg} units/day</span></span>
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

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Staff Management (pharmacy_admin only)
// ─────────────────────────────────────────────────────────────────────────────
const StaffManagement = () => {
  const { t } = useTranslation();
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
      toast.error('Failed to load staff roster');
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
      toast.success(`Staff member added! Temporary credential sent to ${form.email}.`);
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
      toast.success(`Account ${currentStatus ? 'deactivated' : 'activated'} successfully.`);
      setStaff(prev => prev.map(s => s._id === id ? { ...s, isActive: !s.isActive } : s));
    } catch (err) {
      toast.error('Failed to toggle staff status');
    } finally {
      setTogglingId(null);
    }
  };

  const roleColors = {
    pharmacy_admin: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    pharmacist: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    assistant: 'bg-slate-800 text-slate-400 border-slate-700',
  };

  return (
    <PageTransition className="space-y-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-teal-400" />
            {t('pharmacy.staffManagement', 'Staff Management')}
          </h1>
          <p className="text-slate-400 mt-1 text-sm font-medium">Manage pharmacy assistant accounts and operational privileges.</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="glass-button text-xs py-2.5 px-5 flex items-center gap-1.5"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Add Team Member'}
        </button>
      </div>

      {showForm && (
        <div className="glass-panel p-6 rounded-2xl mb-8 border border-teal-500/20 bg-teal-500/5 max-w-lg">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2 select-none">
            <UserCircle className="w-5 h-5 text-teal-400" /> Register Team Member
          </h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Full Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Dr. Jane Smith"
                className="glass-input text-xs"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Email Address</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="pharmacist@example.com"
                className="glass-input text-xs"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Role Privileges</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="glass-input text-xs"
              >
                <option value="pharmacist">Pharmacist</option>
                <option value="assistant">Assistant</option>
                <option value="pharmacy_admin">Admin</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 select-none">
              <Mail className="w-3.5 h-3.5" />
              Temporary authentication credentials will be dispatched to the email.
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {submitting ? 'Registering...' : 'Add Team Member'}
            </button>
          </form>
        </div>
      )}

      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        {loading ? (
          <div className="p-8"><Skeleton.Card /></div>
        ) : staff.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/60 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Staff Name</th>
                  <th className="px-6 py-4">Corporate Email</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                {staff.map(member => (
                  <tr key={member._id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-bold text-white">{member.fullName}</td>
                    <td className="px-6 py-4 text-slate-400 text-xs font-mono">{member.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${roleColors[member.role] || roleColors.assistant}`}>
                        <Shield className="w-3 h-3" />
                        {member.role?.replace('pharmacy_', '').replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {member.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-500 text-xs font-bold">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleToggle(member._id, member.isActive)}
                        disabled={togglingId === member._id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 border ${
                          member.isActive
                            ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20'
                        }`}
                      >
                        {togglingId === member._id ? <Loader2 className="w-3 h-3 animate-spin" /> : (member.isActive ? 'Deactivate' : 'Activate')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 select-none">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-semibold">No registered staff found.</p>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Pharmacy Settings & credential rotation
// ─────────────────────────────────────────────────────────────────────────────
const PharmacySettings = () => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState({ fullName: '', email: '', role: '', description: '', profilePicture: '', pharmacyId: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);


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

  const handlePhotoUpload = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);

    setUploadingPic(true);
    setUploadProgress(15);
    try {
      const res = await api.post('/users/upload-profile-pic', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });
      setProfile(prev => ({ ...prev, profilePicture: res.data.imageUrl }));
      toast.success('Logo updated successfully!');
    } catch (err) {
      toast.error('Failed to upload brand picture.');
    } finally {
      setUploadingPic(false);
      setUploadProgress(0);
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


  if (loading) return <div className="p-8"><Skeleton.Card /></div>;

  return (
    <PageTransition className="space-y-8">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">{t('pharmacy.pharmacySettings', 'Pharmacy Settings')}</h1>
        <p className="text-slate-400 mt-1 text-sm font-medium">Update facility profiles and rotate account passwords.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8 items-start">
        {/* Settings Forms */}
        <div className="lg:col-span-2 space-y-8">
          <form onSubmit={handleSave} className="glass-card p-6 rounded-2xl space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-white/5 select-none">
              <Settings className="w-4 h-4 text-teal-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Facility Settings</h3>
            </div>

            {/* Logo Upload dropzone */}
            <div className="flex items-center gap-6 pb-6 border-b border-white/5">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file) handlePhotoUpload(file); }}
                className={`relative group w-20 h-20 rounded-2xl overflow-hidden border-2 bg-gradient-to-br from-teal-500/10 to-teal-500/25 flex items-center justify-center text-white text-xl font-bold transition-all duration-300 ${
                  isDragging ? 'border-dashed border-teal-400 bg-teal-500/20 scale-105 shadow-lg' : 'border-white/10'
                }`}
              >
                {profile.profilePicture ? (
                  <img src={profile.profilePicture} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  profile.fullName?.charAt(0) || 'P'
                )}

                {!uploadingPic && (
                  <label className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity duration-200 p-1 text-center select-none text-[9px] font-bold text-slate-300 leading-tight">
                    <Camera className="w-4.5 h-4.5 text-teal-400 mb-1" />
                    Drag & Drop
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => { const file = e.target.files[0]; if (file) handlePhotoUpload(file); }} 
                      className="hidden" 
                      disabled={uploadingPic} 
                    />
                  </label>
                )}

                {uploadingPic && (
                  <div className="absolute inset-0 bg-[#020817]/95 flex flex-col items-center justify-center p-2 text-center rounded-2xl select-none">
                    <Loader2 className="w-4 h-4 text-teal-400 animate-spin mb-1" />
                    <span className="text-[9px] font-bold text-slate-300 font-mono">{uploadProgress}%</span>
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-white font-bold text-sm">Pharmacy Logo</h4>
                <p className="text-slate-500 text-xs mt-1">Recommended: 256x256px JPG or PNG. Max size 2MB.</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase text-slate-500 select-none">User Full Name</label>
                <input type="text" value={profile.fullName || ''} disabled className="glass-input text-xs text-slate-500 cursor-not-allowed" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase text-slate-500 select-none">Email Address</label>
                <input type="email" value={profile.email || ''} disabled className="glass-input text-xs text-slate-500 cursor-not-allowed" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-slate-500 select-none">Biographical Summary</label>
              <textarea value={profile.description || ''} onChange={e => setProfile({...profile, description: e.target.value})} rows={3} placeholder="Describe facility, operating details..." className="glass-input text-sm resize-none" />
            </div>

            <div className="flex justify-end pt-4 border-t border-white/5">
              <button type="submit" disabled={saving} className="glass-button text-xs py-2.5 px-6">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>

          <LanguagePreferenceCard />

          {/* Password Rotation Card */}
          <ChangePasswordCard />
        </div>

        {/* Unavailable integration: do not present sample credentials as provisioned. */}
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-white/5 select-none">
              <Key className="w-4.5 h-4.5 text-teal-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">External Inventory Integration</h3>
            </div>
            <p role="status" className="text-xs text-slate-400 leading-relaxed">
              External inventory integration is unavailable. No integration client, token or webhook has been provisioned.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              External inventory systems cannot be linked from this page.
            </p>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PHARMACY PORTAL MAIN ROUTER
// ─────────────────────────────────────────────────────────────────────────────
export default function PharmacyDashboard() {
  const { t } = useTranslation();
  const role = getPharmacyRole();
  const isAdmin = role === 'pharmacy_admin';
  const canDispense = role === 'pharmacist' || isAdmin;
  const defaultPath = canDispense ? '/pharmacy/dashboard/dispense' : '/pharmacy/dashboard/settings';

  const menuItems = [
    ...(canDispense ? [
      { label: t('pharmacy.dispense', 'Dispense'), path: '/pharmacy/dashboard/dispense', icon: Package },
      { label: t('pharmacy.dispenseOtc', 'Manual OTC'), path: '/pharmacy/dashboard/otc', icon: ShoppingBag },
    ] : []),
    { label: t('pharmacy.dispenseHistory', 'History'),     path: '/pharmacy/dashboard/history',   icon: Clock },
    ...(isAdmin ? [
      { label: t('pharmacy.restockAlerts', 'Restock ML'),  path: '/pharmacy/dashboard/restock',   icon: Pill },
      { label: t('nav.analytics', 'Analytics'),   path: '/pharmacy/dashboard/analytics', icon: BarChart3 },
      { label: t('pharmacy.staffManagement', 'Staff'),       path: '/pharmacy/dashboard/staff',     icon: Users }
    ] : []),
    { label: t('common.settings', 'Settings'),    path: '/pharmacy/dashboard/settings',  icon: Settings },
  ];

  const userName = localStorage.getItem('userName') || 'Pharmacy Staff';
  const rawRole = localStorage.getItem('role') || role;
  const displayRole = rawRole === 'pharmacy_admin' ? 'Pharmacy Admin' : 
                      rawRole === 'pharmacist' ? 'Staff Pharmacist' : 
                      rawRole.replace('_', ' ');

  return (
    <PatientAccessProvider>
    <div className="pharmacy-theme">
      <AppShell
        role="pharmacy"
        userName={userName}
        userRole={displayRole}
        menuItems={menuItems}
      >
        <ActiveOutbreakBanner />
        <div className="mt-4">
          <Routes>
            <Route path="/dashboard" element={<Navigate to={defaultPath} replace />} />
            <Route path="/dashboard/dispense" element={canDispense ? <Dispense /> : <Navigate to={defaultPath} replace />} />
            <Route path="/dashboard/otc" element={canDispense ? <ManualDispenseOTC /> : <Navigate to={defaultPath} replace />} />
            <Route path="/dashboard/history"        element={<History />} />
            <Route path="/dashboard/restock"        element={<RestockPredictor />} />
            
            {isAdmin && (
              <>
                <Route path="/dashboard/analytics"      element={<RestockAnalytics />} />
                <Route path="/dashboard/staff"          element={<StaffManagement />} />
              </>
            )}
            <Route path="/dashboard/settings"       element={<PharmacySettings />} />
            <Route path="*" element={<Navigate to={defaultPath} replace />} />
          </Routes>
        </div>
      </AppShell>
    </div>
    </PatientAccessProvider>
  );
}
