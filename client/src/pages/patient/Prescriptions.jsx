import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Pill, Clock, CheckCircle, AlertTriangle, Search } from 'lucide-react';
import api from '../../api/axiosInstance';
import PageTransition from '../../components/common/PageTransition';

const PatientPrescriptions = () => {
  const [prescriptions, setPrescriptions] = useState([]);
  const [activeTab, setActiveTab] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  let nic = localStorage.getItem('nic');
  if (!nic) {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try { nic = JSON.parse(userStr).nic; } catch(e) {}
    }
  }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['patientPrescriptions', nic],
    queryFn: async () => {
      const res = await api.get(`/patient/${nic}/timeline`);
      return res.data.data || res.data;
    },
    enabled: !!nic,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (data) {
      const allRx = [];
      const events = Array.isArray(data) ? data : [];
      
      events.filter(e => e.type === 'prescription').forEach(event => {
        const rxData = event.data || {};
        // If the prescription has multiple medications (new structure)
        if (rxData.medications && Array.isArray(rxData.medications)) {
          rxData.medications.forEach(m => {
            allRx.push({
              ...rxData,
              _id: `${rxData._id}-${m.name}`,
              drugName: m.name,
              dosage: m.dosage,
              frequency: m.frequency,
              durationDays: m.durationDays,
              doctorName: rxData.doctorId?.fullName || 'Doctor',
              hospitalName: rxData.hospitalId?.name || 'Hospital',
              consultationDate: event.date,
            });
          });
        } else {
          // Fallback for old structure or single medication
          allRx.push({
            ...rxData,
            doctorName: rxData.doctorId?.fullName || 'Doctor',
            hospitalName: rxData.hospitalId?.name || 'Hospital',
            consultationDate: event.date,
          });
        }
      });
      setPrescriptions(allRx);
    }
  }, [data]);

  const now = new Date();

  const categorized = {
    active: prescriptions.filter(rx => rx.status === 'issued' && (!rx.expiresAt || new Date(rx.expiresAt) > now)),
    dispensed: prescriptions.filter(rx => rx.status === 'dispensed'),
    expired: prescriptions.filter(rx => rx.status === 'expired' || (rx.status === 'issued' && rx.expiresAt && new Date(rx.expiresAt) <= now)),
  };

  const filteredRx = categorized[activeTab]?.filter(rx => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (rx.drugName?.toLowerCase().includes(q)) || (rx.doctorName?.toLowerCase().includes(q));
  }) || [];

  const tabs = [
    { key: 'active', label: 'Active', icon: Clock, count: categorized.active.length, color: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30' },
    { key: 'dispensed', label: 'Dispensed', icon: CheckCircle, count: categorized.dispensed.length, color: 'text-blue-400 bg-blue-500/20 border-blue-500/30' },
    { key: 'expired', label: 'Expired', icon: AlertTriangle, count: categorized.expired.length, color: 'text-red-400 bg-red-500/20 border-red-500/30' },
  ];

  const getStatusBadge = (rx) => {
    if (rx.status === 'dispensed') return { text: 'Dispensed', cls: 'bg-blue-500/20 text-blue-400' };
    if (rx.status === 'expired' || (rx.expiresAt && new Date(rx.expiresAt) <= now)) return { text: 'Expired', cls: 'bg-red-500/20 text-red-400' };
    return { text: 'Ready for Pickup', cls: 'bg-emerald-500/20 text-emerald-400' };
  };

  if (!nic) return (
    <div className="flex h-full items-center justify-center p-20 text-center">
      <div>
        <p className="text-red-500 font-semibold mb-2">Session expired.</p>
        <button onClick={() => window.location.href = '/patient/login'} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl">Go to Login</button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-20">
        <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (isError) return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 m-4 text-center">
      <p className="text-red-400 font-semibold mb-2">Failed to load prescriptions</p>
      <p className="text-red-500/70 text-sm mb-4">
        {error?.response?.data?.error || error?.message || 'Unknown error'}
      </p>
      <button onClick={() => window.location.reload()} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded text-sm">
        Retry
      </button>
    </div>
  );

  return (
    <PageTransition className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">My Prescriptions</h1>
        <p className="text-slate-400 mt-1">Track all your medications and prescription status.</p>
      </div>

      {/* Tab Bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
              activeTab === tab.key
                ? tab.color
                : 'text-slate-400 bg-slate-800/40 border-slate-700/50 hover:border-slate-600'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            <span className={`text-xs px-2 py-0.5 rounded-full ml-1 ${
              activeTab === tab.key ? 'bg-white/10' : 'bg-slate-700'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="w-4 h-4 text-slate-500" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by drug name or doctor..."
          className="w-full pl-11 pr-4 py-3 bg-slate-800/40 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-transparent transition-all"
        />
      </div>

      {/* Prescription Cards */}
      {filteredRx.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <Pill className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg">No {activeTab} prescriptions found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRx.map((rx, index) => {
            const badge = getStatusBadge(rx);
            return (
              <motion.div
                key={rx._id || index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="glass-panel rounded-xl border border-slate-700/50 p-5 hover:border-slate-600 transition-all"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">{rx.drugName || 'Prescription'}</h3>
                    <p className="text-sm text-teal-400 mt-0.5">Dr. {rx.doctorName || 'Unknown'}</p>
                  </div>
                  <span className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full ${badge.cls}`}>
                    {badge.text}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  {rx.dosage && (
                    <div>
                      <p className="text-slate-500 text-xs uppercase">Dosage</p>
                      <p className="text-slate-300">{rx.dosage}</p>
                    </div>
                  )}
                  {rx.frequency && (
                    <div>
                      <p className="text-slate-500 text-xs uppercase">Frequency</p>
                      <p className="text-slate-300">{rx.frequency}</p>
                    </div>
                  )}
                  {rx.durationDays && (
                    <div>
                      <p className="text-slate-500 text-xs uppercase">Duration</p>
                      <p className="text-slate-300">{rx.durationDays} days</p>
                    </div>
                  )}
                </div>

                {rx.diagnosis && (
                  <div className="pt-3 border-t border-slate-700/50 text-xs text-slate-500">
                    <span className="font-medium">For:</span> {rx.diagnosis}
                  </div>
                )}

                <div className="pt-3 border-t border-slate-700/30 mt-3 flex justify-between text-xs text-slate-500">
                  <span>Issued: {rx.consultationDate ? new Date(rx.consultationDate).toLocaleDateString() : 'N/A'}</span>
                  {rx.expiresAt && <span>Expires: {new Date(rx.expiresAt).toLocaleDateString()}</span>}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </PageTransition>
  );
};

export default PatientPrescriptions;
