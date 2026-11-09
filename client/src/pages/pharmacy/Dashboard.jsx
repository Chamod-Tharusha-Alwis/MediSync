import { formatCalendarDate, formatSriLankaDateTime, formatSriLankaDate } from '../../utils/sriLankaTime';
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
import MedicineSafetyPanel from '../../components/common/MedicineSafetyPanel';
import { formatDoctorName } from '../../utils/doctorName';
import { formatDistrictName } from '../../utils/districtAdjacency';

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
  const [safetyAck, setSafetyAck] = useState({ acknowledged: false, reason: '' });
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
    if (!patientToken) {
      setLoading(false);
      setShowConsentModal(true);
      return;
    }
    try {
      const headers = { 'x-patient-access': patientToken };
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

  const groupedConsultations = useMemo(() => {
    const groups = new Map();
    for (const rx of prescriptions) {
      const key = rx.consultationRef || (typeof rx.consultationId === 'string' ? rx.consultationId : rx.consultationId?._id) || rx._id;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          consultationRef: rx.consultationRef || (typeof rx.consultationId === 'string' ? rx.consultationId : rx.consultationId?._id) || 'Direct Order',
          doctorName: rx.doctorId?.fullName || rx.doctorName || 'Authorized Medical Officer',
          hospitalName: rx.hospitalId?.name || rx.hospitalName || rx.clinicName || 'Clinical Health Facility',
          createdAt: rx.createdAt || rx.date,
          prescriptions: []
        });
      }
      groups.get(key).prescriptions.push(rx);
    }
    return Array.from(groups.values());
  }, [prescriptions]);

  const openDispenseModal = async (rx) => {
    const generation = searchGeneration.current;
    let stock = [];
    try {
      const res = await api.get('/pharmacy/inventory').catch(() => null);
      if (generation !== searchGeneration.current) return;
      stock = res?.data?.data || [];
    } catch (_) {}
    if (generation !== searchGeneration.current) return;
    setInventory(stock);
    const meds = rx.medications?.length ? rx.medications : [{ name: rx.drugName, dosage: rx.dosage, durationDays: rx.durationDays }];
    setDispenseItems(meds.map(m => {
      const matches = stock.filter(i => i.drugName?.trim().toLowerCase() === m.name?.trim().toLowerCase());
      return {
        prescribed: m.name,
        drugName: m.name,
        dosage: m.dosage || rx.dosage || 'Standard',
        inventoryItemId: matches.length === 1 ? matches[0]._id : (matches[0]?._id || ''),
        quantity: m.durationDays ? String(Math.max(1, parseInt(m.durationDays, 10))) : '1',
        unit: matches[0]?.unit || 'units'
      };
    }));
    setCheckoutKey(`rx:${rx._id || rx.prescriptionId}`);
    setIsAlt(false);
    setSafetyAck({ acknowledged: false, reason: '' });
    setAltDetails('');
    setSelectedRx(rx);
    setShowDispenseModal(true);
  };

  const confirmDispense = async () => {
    if (!selectedRx) return;
    if (isAlt && !altDetails.trim()) return toast.error('Please describe the alternative medication dispensed.');
    const items = dispenseItems.map(item => {
      const inv = inventory.find(i => i._id === item.inventoryItemId);
      return {
        inventoryItemId: inv?._id || item.inventoryItemId || undefined,
        drugName: inv?.drugName || item.drugName || item.prescribed,
        unit: inv?.unit || item.unit || 'units',
        dosage: item.dosage || selectedRx.dosage || 'Standard',
        quantityDispensed: Number(item.quantity)
      };
    });
    if (items.some(i => !Number.isSafeInteger(i.quantityDispensed) || i.quantityDispensed <= 0)) {
      return toast.error('Select inventory and enter a positive whole quantity for every medicine.');
    }
    setDispensing(true);
    try {
      const targetNic = selectedRx.patientNic || loadedNic;
      const patientToken = getPatientToken ? getPatientToken(targetNic) : null;
      await api.post('/pharmacy/dispense', {
        prescriptionId: selectedRx.prescriptionId || selectedRx._id,
        patientNic: targetNic,
        items,
        isAlternativeDispensed: isAlt,
        safetyAcknowledgment: safetyAck,
        alternativeDetails: isAlt ? altDetails.trim() : undefined,
      }, { headers: { 'Idempotency-Key': checkoutKey, ...(patientToken ? { 'x-patient-access': patientToken } : {}) } });
      toast.success('Prescription dispensing recorded.');
      setPrescriptions(prev => prev.filter(p => (p.prescriptionId || p._id) !== (selectedRx.prescriptionId || selectedRx._id)));
      setShowDispenseModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to dispense');
    } finally {
      setDispensing(false);
    }
  };

  const handleBulkDispense = async (group) => {
    const patientToken = getPatientToken ? getPatientToken(loadedNic) : null;
    setDispensing(true);
    let successCount = 0;
    try {
      for (const rx of group.prescriptions) {
        const meds = rx.medications?.length ? rx.medications : [{ name: rx.drugName, dosage: rx.dosage, durationDays: rx.durationDays }];
        const items = meds.map(m => ({
          drugName: m.name,
          dosage: m.dosage || rx.dosage || 'Standard',
          unit: 'units',
          quantityDispensed: m.durationDays ? Math.max(1, parseInt(m.durationDays, 10)) : 1
        }));
        const key = `bulk:rx:${rx._id || rx.prescriptionId}:${Date.now()}`;
        await api.post('/pharmacy/dispense', {
          prescriptionId: rx._id || rx.prescriptionId,
          patientNic: loadedNic,
          items,
          isAlternativeDispensed: false,
          notes: `Consultation bulk dispense ${group.consultationRef}`
        }, { headers: { 'Idempotency-Key': key, ...(patientToken ? { 'x-patient-access': patientToken } : {}) } });
        successCount++;
      }
      toast.success(`Successfully dispensed ${successCount} prescription order(s) for consultation ${group.consultationRef}.`);
      setPrescriptions(prev => prev.filter(p => !group.prescriptions.some(grx => (grx._id || grx.prescriptionId) === (p._id || p.prescriptionId))));
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed during bulk dispense (dispensed ${successCount}).`);
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
              <p className="text-slate-300 text-sm">{patientInfo.dateOfBirth ? formatCalendarDate(patientInfo.dateOfBirth) : 'N/A'}</p>
            </div>
          </div>
        </div>
      )}

      {prescriptions.length > 0 && (
        <div className="space-y-6">
          <div className="flex justify-between items-center select-none">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Pill className="w-4 h-4 text-teal-400 animate-pulse-subtle" /> Active Prescriptions for {patientInfo?.fullName || 'Patient'}
            </h2>
            <span className="text-xs font-mono font-bold text-teal-400">{prescriptions.length} items across {groupedConsultations.length} order(s)</span>
          </div>

          {groupedConsultations.map((group) => (
            <div key={group.key} className="glass-panel rounded-2xl overflow-hidden border border-white/5 space-y-0">
              {/* Consultation Card Header */}
              <div className="p-5 bg-slate-900/80 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-mono font-bold">
                      Ref: {group.consultationRef}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      {group.createdAt ? formatSriLankaDateTime(group.createdAt) : ''}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 font-semibold">
                    Referred by <span className="text-white font-bold">{formatDoctorName(group.doctorName, 'Practitioner')}</span> &bull; <span className="text-slate-400">{group.hospitalName}</span>
                  </p>
                </div>
                <button
                  type="button"
                  disabled={dispensing}
                  onClick={() => handleBulkDispense(group)}
                  className="px-4 py-2 bg-emerald-600/15 border border-emerald-500/30 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" /> Dispense Consultation Order
                </button>
              </div>

              {/* Medicines Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-950/40 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">{t("pharmacy.drugName", "Medication Name")}</th>
                      <th className="px-5 py-3.5">Prescription ID</th>
                      <th className="px-5 py-3.5">{t("pharmacy.dosageLabel", "Dosage")}</th>
                      <th className="px-5 py-3.5">{t("pharmacy.frequencyLabel", "Frequency")}</th>
                      <th className="px-5 py-3.5">{t("pharmacy.durationLabel", "Duration")}</th>
                      <th className="px-5 py-3.5 text-right">{t("common.actions", "Actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs text-slate-200">
                    {group.prescriptions.map((rx) => {
                      const mainDrug = rx.medications && rx.medications.length > 0 ? rx.medications[0] : null;
                      const drugName = mainDrug?.name || rx.drugName || 'Medication';
                      const rxDisplayId = rx.prescriptionId?.split('-')[1] || rx.prescriptionId || rx._id;
                      return (
                        <tr key={rx._id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3.5 font-bold text-white text-sm">
                            {drugName}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-teal-400 font-semibold">
                            #{rxDisplayId}
                          </td>
                          <td className="px-5 py-3.5 text-slate-300 font-medium">
                            {mainDrug?.dosage || rx.dosage || '—'}
                          </td>
                          <td className="px-5 py-3.5 text-slate-300 font-medium">
                            {mainDrug?.frequency || '—'}
                          </td>
                          <td className="px-5 py-3.5 text-slate-300 font-medium">
                            {mainDrug?.durationDays ? `${mainDrug.durationDays} Days` : '—'}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => openDispenseModal(rx)}
                              className="px-3 py-1.5 bg-teal-600/10 border border-teal-500/25 hover:bg-teal-600 text-teal-400 hover:text-white rounded-lg font-bold text-xs transition-all inline-flex items-center gap-1.5"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Dispense Medication
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
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
              <span className="text-[11px] uppercase font-bold text-slate-500 block">{t("pharmacy.drugName", "Medication Name")}</span>
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
                <p className="text-slate-500 text-xs mt-1 leading-normal">{t("pharmacy.substituteHelp", "Select if dispensing a generic alternative different from prescription.")}</p>
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

            <MedicineSafetyPanel
              medications={dispenseItems.map(i => ({ name: i.drugName || i.prescribed, dosage: i.dosage, durationDays: i.quantity }))}
              patientId={selectedRx?.patientId}
              acknowledgment={safetyAck}
              onAcknowledgmentChange={setSafetyAck}
            />

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
                  <th className="px-6 py-4">{t("pharmacy.patientName", "Patient Name")}</th>
                  <th className="px-6 py-4">{t("common.medications", "Medications")}</th>
                  <th className="px-6 py-4">{t("pharmacy.dispensedBy", "Dispensed By")}</th>
                  <th className="px-6 py-4 text-right">{t("common.timestamp", "Timestamp")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                {history.map(record => {
                  const allMeds = Array.isArray(record.medications) && record.medications.length > 0
                    ? record.medications
                    : Array.isArray(record.items) && record.items.length > 0
                    ? record.items.map(i => ({ name: i.drugName || i.name, dosage: i.dosage, quantityDispensed: i.quantityDispensed, unit: i.unit }))
                    : Array.isArray(record.prescriptionId?.medications) && record.prescriptionId.medications.length > 0
                    ? record.prescriptionId.medications.map(m => ({ name: m.name || m.drugName, dosage: m.dosage, quantityDispensed: m.quantity || 1, unit: m.unit || "units" }))
                    : record.prescriptionId?.drugName
                    ? [{ name: record.prescriptionId.drugName, dosage: record.prescriptionId.dosage || "", quantityDispensed: 1, unit: "units" }]
                    : [];
                  const drugLabel = record.medicationSummary || (allMeds.length > 0
                    ? allMeds.map(m => m.name + (m.dosage ? " " + m.dosage : "") + (m.quantityDispensed ? " (" + m.quantityDispensed + " " + (m.unit || "units") + ")" : "")).join(", ")
                    : "?");
                  return (
                    <tr key={record.receiptNumber || record._id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-white text-xs">{record.receiptNumber || "?"}</td>
                      <td className="px-6 py-4 font-medium text-slate-200 text-xs">{record.patientName || "Patient"}</td>
                      <td className="px-6 py-4 text-slate-300 text-xs font-medium max-w-[340px]" title={drugLabel}>
                        {allMeds.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {allMeds.map((m, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/80 border border-white/10 text-slate-200 text-xs">
                                <span className="font-semibold text-white">{m.name}</span>
                                {m.dosage && <span className="text-slate-400">{m.dosage}</span>}
                                {m.quantityDispensed && <span className="text-teal-400 font-mono">x{m.quantityDispensed}</span>}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span>?</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-bold">{record.staffId?.fullName || "?"}</td>
                      <td className="px-6 py-4 text-slate-500 font-mono text-xs text-right">{formatSriLankaDateTime(record.createdAt)}</td>
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
          <p className="text-slate-400 mt-1 text-sm font-medium">{t("pharmacy.otcSubtitle", "Record direct over-the-counter checkouts and generate official receipts.")}</p>
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
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-bold hover:bg-teal-500/20 transition-all"
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
                <span>Patient:</span>
                <span className="font-medium text-slate-200">{patientNic && patientNic.trim() ? (patientNic.trim().startsWith('OTC_') ? 'Walk-in Patient' : 'Patient') : 'Walk-in Patient'}</span>
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
              <div className="flex justify-between text-slate-400 text-xs">
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
              <p className="font-bold text-white uppercase tracking-wider text-[11px] text-slate-500">Fulfilled Medications</p>
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
              <div className="flex justify-between text-xs text-slate-400">
                <span>MEDICATION LINES DISPENSED:</span>
                <span>{lastReceipt.medicationCount ?? lastReceipt.medications?.length ?? 0} LINES</span>
              </div>
            </div>

            <div className="flex gap-2 pt-3 border-t border-white/5">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 border border-white/5"
              >
                <Printer className="w-3.5 h-3.5" /> Print Dispensing Record
              </button>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="flex-1 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold"
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
// TAB: Restock Leaderboard Analytics (U12)
// ─────────────────────────────────────────────────────────────────────────────
const RestockAnalytics = () => {
  const { t } = useTranslation();
  const [range, setRange] = useState('24h');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const params = new URLSearchParams({ range });
      if (range === 'custom') {
        if (customStart) params.set('startDate', customStart);
        if (customEnd) params.set('endDate', customEnd);
      }
      const res = await api.get(`/pharmacy/analytics/dispensing?${params.toString()}`);
      setData(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [range, customStart, customEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const { leaderboard, meta } = useMemo(() => {
    const lb = data?.data || [];
    return { leaderboard: lb, meta: data?.meta || {} };
  }, [data]);

  const maxDispensed = useMemo(() =>
    leaderboard.length > 0 ? Math.max(...leaderboard.map(r => r.totalDispensed || r.totalDispensed24h || 1)) : 1,
    [leaderboard]);

  const rangeOptions = [
    { id: '24h', label: '24 Hours' },
    { id: '48h', label: '48 Hours' },
    { id: '72h', label: '72 Hours' },
    { id: '7d', label: '7 Days' },
    { id: '14d', label: '14 Days' },
    { id: '30d', label: '30 Days' },
    { id: 'month', label: 'This Month' },
    { id: 'custom', label: 'Custom' }
  ];

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-indigo-400 animate-pulse-subtle" />
            Dispensing Volume Analytics
          </h1>
          <p className="text-slate-400 mt-1 text-sm font-medium">
            Dispensing volume across medication lines for {meta.pharmacyName || 'your pharmacy'}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-indigo-400 border border-indigo-500/20 font-mono font-semibold">
            {meta.timezone || 'Asia/Colombo (+05:30)'}
          </span>
          <button
            onClick={fetchData}
            className="glass-button text-xs py-2 px-4 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Range Selector Bar */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-900/60 p-2 rounded-xl border border-white/5">
        <span className="text-xs font-bold text-slate-400 px-2 uppercase tracking-wider">Range:</span>
        {rangeOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setRange(opt.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              range === opt.id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="glass-panel p-4 rounded-xl border border-indigo-500/20 flex flex-wrap items-center gap-4 text-xs font-medium bg-indigo-500/5">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Start Date:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="glass-input text-xs py-1 px-2 text-white bg-slate-900"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">End Date:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="glass-input text-xs py-1 px-2 text-white bg-slate-900"
            />
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all"
          >
            Apply Range
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-panel p-5 rounded-2xl border border-white/5">
            <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Medications Dispensed</span>
            <span className="text-2xl font-black text-white mt-1 block font-mono">{meta.drugsAnalyzed || leaderboard.length}</span>
          </div>
          <div className="glass-panel p-5 rounded-2xl border border-indigo-500/10">
            <span className="text-[11px] text-indigo-400/80 uppercase font-bold tracking-wider">Total Units Dispensed</span>
            <span className="text-2xl font-black text-indigo-400 mt-1 block font-mono">
              {leaderboard.reduce((sum, r) => sum + (r.totalDispensed || r.totalDispensed24h || 0), 0)}
            </span>
          </div>
          <div className="glass-panel p-5 rounded-2xl border border-teal-500/10">
            <span className="text-[11px] text-teal-400/80 uppercase font-bold tracking-wider">Dispense Events</span>
            <span className="text-2xl font-black text-teal-400 mt-1 block font-mono">
              {leaderboard.reduce((sum, r) => sum + (r.dispenseEvents || 0), 0)}
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
        <div className="glass-panel rounded-2xl p-12 text-center border border-white/5 select-none space-y-3">
          <Activity className="w-12 h-12 text-slate-600 mx-auto mb-2 opacity-50" />
          <p className="text-slate-300 font-semibold text-lg">
            {t("pharmacy.noDispensingLogsInInterval", "No dispensing logs in this interval")}
          </p>
          <p className="text-slate-400 text-xs max-w-md mx-auto">
            {t("pharmacy.emptyRangeHint", "No dispensing events were recorded in this window. Try selecting a wider range such as 7 Days, 30 Days, or Custom.")}
          </p>
          {["24h", "48h", "72h", "7d", "14d"].includes(range) && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRange("7d")}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-white/10 transition-all"
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setRange("30d")}
                className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-bold border border-indigo-500/30 transition-all"
              >
                30 Days
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && !error && leaderboard.length > 0 && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-900/60 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Rank</th>
                <th className="px-6 py-4">{t("pharmacy.drugName", "Medication Name")}</th>
                <th className="px-6 py-4 text-center">Dispensed Volume</th>
                <th className="px-6 py-4 text-center">Dispense Events</th>
                <th className="px-6 py-4">Volume Distribution</th>
                <th className="px-6 py-4 text-right">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm text-slate-200">
              {leaderboard.map((row) => {
                const total = row.totalDispensed ?? row.totalDispensed24h ?? 0;
                const barWidth = Math.round((total / maxDispensed) * 100);
                return (
                  <tr key={row.rank} className="hover:bg-white/[0.01]">
                    <td className="px-6 py-4 font-bold text-slate-400">#{row.rank}</td>
                    <td className="px-6 py-4 font-bold text-white">{row.drugName}</td>
                    <td className="px-6 py-4 text-center font-mono font-bold text-indigo-400">{total}</td>
                    <td className="px-6 py-4 text-center font-mono text-slate-300">{row.dispenseEvents || 1}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-900 h-1.5 rounded-full overflow-hidden border border-white/5">
                          <div
                            className="h-full rounded-full transition-all bg-indigo-400"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-10 text-right font-mono font-semibold">
                          {barWidth}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-xs text-slate-400">
                      {row.unit || 'units'}
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
// TAB: District Health Demand (U11 Redesign)
// ─────────────────────────────────────────────────────────────────────────────
const RestockPredictor = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const fetchDemand = useCallback(async () => {
    setIsLoading(true); setIsError(false);
    try {
      const res = await api.get('/pharmacy/district-demand');
      setData(res.data);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchDemand(); }, [fetchDemand]);

  const topBurdens = data?.topBurdens || [];
  const topMedications = data?.topMedications || [];
  const district = formatDistrictName(data?.district) || 'District';

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Pill className="w-8 h-8 text-teal-400 animate-pulse-subtle" />
            {t('pharmacy.restockAlertsTitle', 'District Health Demand')}
          </h1>
          <p className="text-slate-400 mt-1 text-sm font-medium">
            Epidemiological disease burdens and 30-day top dispensed pharmaceuticals across {district}.
          </p>
        </div>
        <button onClick={fetchDemand} className="glass-button text-xs py-2 px-4 flex items-center gap-1.5 shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Demand
        </button>
      </div>

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-panel p-5 rounded-2xl border border-white/5">
            <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Target District</span>
            <span className="text-2xl font-black text-white mt-1 block font-mono">{district}</span>
          </div>
          <div className="glass-panel p-5 rounded-2xl border border-teal-500/10">
            <span className="text-[11px] text-teal-400/80 uppercase font-bold tracking-wider">Top Burdens Tracked</span>
            <span className="text-2xl font-black text-teal-400 mt-1 block font-mono">{topBurdens.length}</span>
          </div>
          <div className="glass-panel p-5 rounded-2xl border border-indigo-500/10">
            <span className="text-[11px] text-indigo-400/80 uppercase font-bold tracking-wider">Top Medications</span>
            <span className="text-2xl font-black text-indigo-400 mt-1 block font-mono">{topMedications.length}</span>
          </div>
        </div>
      )}

      {isLoading && <Skeleton.Card />}

      {isError && (
        <div className="glass-panel rounded-2xl p-8 border border-red-500/25 bg-red-500/5 text-center space-y-4 select-none">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-red-400 font-bold">Failed to load district demand data.</p>
          <button onClick={fetchDemand} className="glass-button text-xs py-2.5 px-6 mx-auto">Retry Demand</button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section 1: Top District Health Burdens */}
          <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden flex flex-col">
            <div className="p-5 bg-slate-900/60 border-b border-white/5">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-400" />
                Top Health Burdens ({district})
              </h2>
              <p className="text-xs text-slate-400 mt-1">Consultation visits aggregated by diagnosis in the last 30 days.</p>
            </div>
            <div className="p-4 flex-1">
              {topBurdens.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-950/40 text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">Rank</th>
                      <th className="px-4 py-2.5">Diagnosis</th>
                      <th className="px-4 py-2.5 text-center">Cases</th>
                      <th className="px-4 py-2.5 text-right">Last Reported</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs text-slate-200">
                    {topBurdens.map((b) => (
                      <tr key={b.rank} className="hover:bg-white/[0.01]">
                        <td className="px-4 py-3 font-bold text-slate-400">#{b.rank}</td>
                        <td className="px-4 py-3 font-semibold text-white">{b.diagnosis}</td>
                        <td className="px-4 py-3 text-center font-mono font-bold text-teal-400">{b.cases}</td>
                        <td className="px-4 py-3 text-right text-slate-400 font-mono">
                          {b.lastReported ? formatSriLankaDate(b.lastReported) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs">No active health burden records found for this district.</div>
              )}
            </div>
          </div>

          {/* Section 2: Top 30-Day Dispensed Medications */}
          <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden flex flex-col">
            <div className="p-5 bg-slate-900/60 border-b border-white/5">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Pill className="w-4 h-4 text-indigo-400" />
                Top Dispensed Medications (30-Day District Volume)
              </h2>
              <p className="text-xs text-slate-400 mt-1">Aggregated dispensing volume across district pharmacies.</p>
            </div>
            <div className="p-4 flex-1">
              {topMedications.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-950/40 text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">Rank</th>
                      <th className="px-4 py-2.5">Medication</th>
                      <th className="px-4 py-2.5 text-center">Total Units</th>
                      <th className="px-4 py-2.5 text-right">Dispense Events</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs text-slate-200">
                    {topMedications.map((m) => (
                      <tr key={m.rank} className="hover:bg-white/[0.01]">
                        <td className="px-4 py-3 font-bold text-slate-400">#{m.rank}</td>
                        <td className="px-4 py-3 font-semibold text-white">{m.drugName}</td>
                        <td className="px-4 py-3 text-center font-mono font-bold text-indigo-400">{m.totalQuantity}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-400">{m.dispenseEvents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs">No medication dispensations recorded in the last 30 days.</div>
              )}
            </div>
          </div>
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
            <div className="flex items-center gap-1.5 text-xs text-slate-500 select-none">
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
                  <label className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity duration-200 p-1 text-center select-none text-xs font-bold text-slate-300 leading-tight">
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
                    <span className="text-xs font-bold text-slate-300 font-mono">{uploadProgress}%</span>
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
    ...(isAdmin ? [      { label: t('nav.analytics', 'Analytics'),   path: '/pharmacy/dashboard/analytics', icon: BarChart3 },
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
