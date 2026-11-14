import { formatCalendarDate, formatSriLankaDateTime } from '../../utils/sriLankaTime';
import LanguagePreferenceCard from '../../components/common/LanguagePreferenceCard';
import PatientAccessModal from '../../components/PatientAccessModal';
import { PatientAccessProvider, usePatientAccess } from '../../context/PatientAccessContext';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Package, Clock, Search, CheckCircle, Pill, Plus, Loader2, Users, UserCircle, Shield, Mail, AlertTriangle, X, Settings, Camera, Save
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
  const [safetyReviewed, setSafetyReviewed] = useState(false);
  const [selectedRx, setSelectedRx] = useState(null);
  const [isAlt, setIsAlt] = useState(false);
  const [altDetails, setAltDetails] = useState('');
  const [dispenseItems, setDispenseItems] = useState([]);
  const [checkoutKey, setCheckoutKey] = useState('');
  const [safetyAck, setSafetyAck] = useState({ acknowledged: false, reason: '' });
  const [safetyPanelMeds, setSafetyPanelMeds] = useState([]);
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
          doctorName: rx.doctorId?.fullName || rx.doctorName || 'Unavailable',
          hospitalName: rx.hospitalId?.name || rx.hospitalName || rx.clinicName || 'Unavailable',
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
    if (generation !== searchGeneration.current) return;
    const meds = rx.medications?.length ? rx.medications : [{ name: rx.drugName, dosage: rx.dosage, durationDays: rx.durationDays }];
    setDispenseItems(meds.map(m => ({
      prescribed: m.name,
      drugName: m.name,
      dosage: m.dosage || rx.dosage || 'Standard',
      frequency: m.frequency || rx.frequency || 'As directed',
      duration: m.durationDays ? `${m.durationDays} days` : 'Standard duration',
      quantity: m.durationDays ? String(Math.max(1, parseInt(m.durationDays, 10))) : '1',
      unit: 'units'
    })));

    // Resolve co-prescribed medications from the same consultation/encounter so DDI warnings trigger in the safety panel
    const coRxs = Array.isArray(prescriptions)
      ? prescriptions.filter(p => (rx.consultationId && p.consultationId === rx.consultationId) || (rx.consultationRef && p.consultationRef === rx.consultationRef))
      : [rx];
    const coMeds = (coRxs.length > 0 ? coRxs : [rx]).flatMap(p => p.medications?.length ? p.medications : [{ name: p.drugName, dosage: p.dosage, durationDays: p.durationDays }]);
    const uniqueMedsMap = new Map();
    for (const m of coMeds) {
      const key = (m.name || m.drugName || '').trim().toLowerCase();
      if (key && !uniqueMedsMap.has(key)) {
        uniqueMedsMap.set(key, { name: m.name || m.drugName, dosage: m.dosage, durationDays: m.durationDays });
      }
    }
    setSafetyPanelMeds(Array.from(uniqueMedsMap.values()));

    setCheckoutKey(`rx:${rx._id || rx.prescriptionId}`);
    setIsAlt(false);
    setSafetyReviewed(false);
    setSafetyAck({ acknowledged: false, reason: '' });
    setAltDetails('');
    setSelectedRx(rx);
    setShowDispenseModal(true);
  };

  const confirmDispense = async () => {
    if (!selectedRx) return;
    if (isAlt && !altDetails.trim()) return toast.error('Please describe the alternative medication dispensed.');
    const items = dispenseItems.map(item => ({
      drugName: item.drugName || item.prescribed,
      unit: item.unit || 'units',
      dosage: item.dosage || selectedRx.dosage || 'Standard',
      frequency: item.frequency || selectedRx.frequency || 'As directed',
      quantityDispensed: Number(item.quantity)
    }));
    if (items.some(i => !Number.isSafeInteger(i.quantityDispensed) || i.quantityDispensed <= 0)) {
      return toast.error('Enter a positive whole quantity for every medicine.');
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
      const status = err.response?.status;
      const errorMsg = err.response?.data?.error || err.response?.data?.message;
      if (status === 409 || err.response?.data?.code === 'ALREADY_DISPENSED' || /already|eligible/i.test(errorMsg || '')) {
        toast.error('This prescription has already been dispensed.');
      } else {
        toast.error(errorMsg || 'Failed to dispense');
      }
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
      const status = err.response?.status;
      const errorMsg = err.response?.data?.error || err.response?.data?.message;
      if (status === 409 || err.response?.data?.code === 'ALREADY_DISPENSED' || /already|eligible/i.test(errorMsg || '')) {
        toast.error('This prescription has already been dispensed.');
      } else {
        toast.error(errorMsg || `Failed during bulk dispense (dispensed ${successCount}).`);
      }
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
              <p className="text-slate-200 text-sm truncate">{patientInfo.contactInfo || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-slate-500 uppercase tracking-wider mb-1">{t("patient.bloodGroup", "Blood Group")}</p>
              {patientInfo.bloodGroup ? (
                <p className="text-slate-200 text-sm">{patientInfo.bloodGroup}</p>
              ) : (
                <p className="text-slate-400 text-sm font-normal">Not provided</p>
              )}
            </div>
            <div>
              <p className="text-slate-500 uppercase tracking-wider mb-1">{t("patient.dob", "Date of Birth")}</p>
              <p className="text-slate-300 text-sm">{patientInfo.dateOfBirth ? formatCalendarDate(patientInfo.dateOfBirth) : 'Not provided'}</p>
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
                    Referred by <span className="text-white font-bold">{formatDoctorName(group.doctorName, 'Unavailable')}</span> &bull; <span className="text-slate-400">{group.hospitalName}</span>
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
                      const durationDays = mainDrug?.durationDays ?? rx.durationDays;
                      const rxDisplayId = rx.prescriptionId?.split('-')[1] || rx.prescriptionId || rx._id;
                      return (
                        <tr key={rx._id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3.5 font-bold text-white text-sm">
                            <div>{drugName}</div>
                            {rx.safetyOverride?.acknowledged && (
                              <div data-testid="prescriber-override-badge" className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] uppercase tracking-wider font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300">
                                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                <span>Prescriber acknowledged safety warnings ({(rx.safetyOverride.findingTypes || []).join(', ') || 'advisory'})</span>
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-teal-400 font-semibold">
                            #{rxDisplayId}
                          </td>
                          <td className="px-5 py-3.5 text-slate-300 font-medium">
                            {mainDrug?.dosage || rx.dosage || '—'}
                          </td>
                          <td className="px-5 py-3.5 text-slate-300 font-medium">
                            {mainDrug?.frequency || rx.frequency || '—'}
                          </td>
                          <td className="px-5 py-3.5 text-slate-300 font-medium">
                            {durationDays ? `${durationDays} ${t('activity.days', 'days')}` : '—'}
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

            {selectedRx.safetyOverride?.acknowledged && (
              <div data-testid="dispense-prescriber-override" className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-amber-300 block">Prescriber Safety Override</span>
                  <span className="text-xs text-slate-300">
                    Clinician acknowledged: {(selectedRx.safetyOverride.findingTypes || []).join(', ')}.
                  </span>
                </div>
              </div>
            )}

            {dispenseItems.map((item, index) => (
              <div key={index} className="p-3.5 rounded-xl border border-white/5 bg-slate-950/40 space-y-2.5">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[11px] uppercase font-bold text-slate-500 block">{t("pharmacy.drugName", "Medication Name")}</span>
                    <span className="text-white font-bold">{item.drugName}</span>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase font-bold text-slate-500 block">Dosage</span>
                    <span className="text-slate-300">{item.dosage}</span>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase font-bold text-slate-500 block">Frequency</span>
                    <span className="text-slate-300">{item.frequency}</span>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase font-bold text-slate-500 block">Duration</span>
                    <span className="text-slate-300">{item.duration}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-white/5">
                  <label className={labelClass} htmlFor={`qty-${index}`}>{t("pharmacy.quantity", "Quantity Dispensed")}</label>
                  <input
                    id={`qty-${index}`}
                    type="number"
                    min="1"
                    step="1"
                    aria-label="Quantity dispensed"
                    className="glass-input w-full text-xs"
                    value={item.quantity}
                    disabled={dispensing}
                    onChange={e => setDispenseItems(prev => prev.map((m, i) => i === index ? {...m, quantity: e.target.value} : m))}
                  />
                </div>
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
              medications={safetyPanelMeds.length > 0 ? safetyPanelMeds : dispenseItems.map(i => ({ name: i.drugName || i.prescribed, dosage: i.dosage, durationDays: i.quantity }))}
              patientId={selectedRx?.patientId}
              patientNic={loadedNic}
              consentToken={getPatientToken?.(loadedNic)}
              acknowledgment={safetyAck}
              onAcknowledgmentChange={setSafetyAck}
            />

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-700/60 bg-slate-950/40 cursor-pointer hover:bg-slate-950/70 transition-all select-none text-xs text-slate-300 font-medium">
              <input
                type="checkbox"
                data-testid="pharmacist-safety-checkbox"
                checked={safetyReviewed}
                onChange={e => {
                  setSafetyReviewed(e.target.checked);
                  setSafetyAck({ acknowledged: e.target.checked, reason: 'Pharmacist reviewed safety information' });
                }}
                className="mt-0.5 rounded border-slate-700 bg-slate-950 text-teal-500 focus:ring-teal-400"
              />
              <span>I have reviewed the safety information</span>
            </label>

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
                Confirm Dispense
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
    ] : []),
    { label: t('pharmacy.dispenseHistory', 'History'),     path: '/pharmacy/dashboard/history',   icon: Clock },
    ...(isAdmin ? [
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
            <Route path="/dashboard/history"        element={<History />} />            
            {isAdmin && (
              <>
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
