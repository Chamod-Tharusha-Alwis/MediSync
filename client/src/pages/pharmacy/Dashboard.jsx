import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { LayoutDashboard, Package, Clock, Search, CheckCircle, Pill } from 'lucide-react';
import api from '../../api/axiosInstance';
import Sidebar from '../../components/common/Sidebar';
import PageTransition from '../../components/common/PageTransition';

const Dispense = () => {
  const [nic, setNic] = useState('');
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dispensing, setDispensing] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!nic) return toast.error('Enter Patient NIC');
    
    setLoading(true);
    try {
      const { data } = await api.get(`/pharmacy/prescriptions/pending/${nic}`);
      setPrescriptions(data.data);
      if (data.data.length === 0) toast.info('No pending prescriptions found for this NIC.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to fetch prescriptions');
    } finally {
      setLoading(false);
    }
  };

  const handleDispense = async (rx) => {
    setDispensing(true);
    try {
      await api.post(`/pharmacy/dispense`, {
        prescriptionId: rx.prescriptionId,
        patientNic: rx.patientNic
      });
      toast.success('Prescription dispensed successfully!');
      setPrescriptions(prev => prev.filter(p => p._id !== rx._id));
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
              type="text" 
              value={nic}
              onChange={(e) => setNic(e.target.value)}
              placeholder="Enter Patient NIC (e.g. 981234567V)"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-6 py-4 text-white text-lg focus:border-emerald-500 outline-none uppercase placeholder:normal-case placeholder:text-slate-500"
            />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="glass-button bg-emerald-600 hover:bg-emerald-500 text-white px-8 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center shadow-[0_0_15px_rgba(16,185,129,0.3)]"
          >
            {loading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <><Search className="w-5 h-5 mr-2" /> Find</>}
          </button>
        </form>
      </div>

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
                <div key={rx._id} className="bg-slate-800/40 border border-slate-700 p-5 rounded-xl flex flex-col justify-between hover:bg-slate-800/60 transition-colors" style={{ animationDelay: `${index * 100}ms` }}>
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="text-xl font-bold text-white">{mainDrug?.name || rx.drugName || 'Unknown Drug'}</h3>
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-bold rounded">#{rx.prescriptionId.split('-')[1] || rx.prescriptionId}</span>
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
                  
                  <button 
                    onClick={() => handleDispense(rx)}
                    disabled={dispensing}
                    className="w-full py-3 bg-emerald-600/20 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-lg font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Dispense Now
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PageTransition>
  );
};

const History = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/pharmacy/history').then(res => {
      setHistory(res.data.data);
      setLoading(false);
    }).catch(err => {
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
          <div className="p-8 text-center text-slate-400">Loading history...</div>
        ) : history.length > 0 ? (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-800/80 border-b border-slate-700 text-slate-300">
              <tr>
                <th className="px-6 py-4 font-medium">Receipt No</th>
                <th className="px-6 py-4 font-medium">Patient NIC</th>
                <th className="px-6 py-4 font-medium">Pharmacist</th>
                <th className="px-6 py-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map(record => (
                <tr key={record._id} className="border-b border-slate-800 hover:bg-slate-800/30">
                  <td className="px-6 py-4 text-white font-mono text-sm">{record.dispensingId}</td>
                  <td className="px-6 py-4 text-slate-300">{record.patientNic}</td>
                  <td className="px-6 py-4 text-slate-400">{record.pharmacistId?.fullName || 'N/A'}</td>
                  <td className="px-6 py-4 text-slate-500">{new Date(record.createdAt).toLocaleString()}</td>
                </tr>
              ))}
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

export default function PharmacyDashboard() {
  const menuItems = [
    { label: 'Overview', path: '/pharmacy/dashboard', icon: LayoutDashboard, end: true },
    { label: 'Dispense', path: '/pharmacy/dashboard/dispense', icon: Package },
    { label: 'History', path: '/pharmacy/dashboard/history', icon: Clock },
  ];

  return (
    <div className="pharmacy-theme flex min-h-screen bg-[#0b1120]">
      <Sidebar menuItems={menuItems} title="Pharmacy Portal" themePrefix="pharmacy" />
      
      <main className="flex-1 lg:ml-64 p-4 overflow-y-auto h-screen">
        <Routes>
          <Route path="/dashboard" element={<Dispense />} />
          <Route path="/dashboard/dispense" element={<Dispense />} />
          <Route path="/dashboard/history" element={<History />} />
          <Route path="*" element={<Navigate to="/pharmacy/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}