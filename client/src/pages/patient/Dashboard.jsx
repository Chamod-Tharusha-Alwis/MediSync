import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { LayoutDashboard, HeartPulse, FileText, Pill } from 'lucide-react';
import api from '../../api/axiosInstance';
import Sidebar from '../../components/common/Sidebar';
import PageTransition from '../../components/common/PageTransition';

const Overview = ({ data }) => {
  if (!data || !data.patient) return <div className="p-8 text-center text-slate-400">Loading your health records...</div>;

  const { patient, prescriptions, consultations } = data;
  const activeRxs = (prescriptions || []).filter(p => p.status === 'issued' && new Date(p.expiresAt) > new Date());

  return (
    <PageTransition className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Welcome back, {patient.fullName.split(' ')[0]}</h1>
        <p className="text-slate-400 mt-1">Here is an overview of your health status.</p>
      </div>

      {/* Health Summary Banner */}
      <div className="glass-panel p-6 rounded-2xl mb-8 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
          <HeartPulse className="w-48 h-48 text-pink-500" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row gap-8">
          <div className="flex-1">
            <h2 className="text-sm uppercase tracking-wider font-bold text-pink-400 mb-2">Patient Profile</h2>
            <p className="text-2xl font-semibold text-white mb-4">{patient.fullName}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-slate-400 text-xs uppercase">Blood Group</p>
                <p className="text-white font-medium">{patient.bloodGroup || 'Not set'}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs uppercase">Age</p>
                <p className="text-white font-medium">{patient.dateOfBirth ? new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear() : 'N/A'}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs uppercase">NIC</p>
                <p className="text-white font-medium">{patient.nic}</p>
              </div>
            </div>
            
            {patient.allergies?.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-700/50">
                <p className="text-slate-400 text-xs uppercase mb-2">Known Allergies</p>
                <div className="flex flex-wrap gap-2">
                  {patient.allergies.map((allergy, i) => (
                    <span key={i} className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-medium border border-red-500/30">
                      {allergy}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Active Prescriptions */}
        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Pill className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-white">Active Prescriptions</h3>
          </div>
          
          {activeRxs.length > 0 ? (
            <div className="space-y-4">
              {activeRxs.map(rx => (
                <div key={rx._id} className="bg-slate-800/40 border border-slate-700 p-4 rounded-xl hover:bg-slate-800/60 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-white font-bold text-lg">{rx.medications && rx.medications.length > 0 ? rx.medications[0].name : rx.drugName || 'Prescription'}</p>
                      <p className="text-slate-400 text-sm">Dr. {rx.doctorId?.fullName || 'Doctor'}</p>
                    </div>
                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded uppercase">
                      Ready to pickup
                    </span>
                  </div>
                  {rx.medications && rx.medications.length > 0 && (
                     <div className="mt-3 text-sm text-slate-300">
                       <p><span className="text-slate-500">Dosage:</span> {rx.medications[0].dosage}</p>
                       <p><span className="text-slate-500">Frequency:</span> {rx.medications[0].frequency}</p>
                     </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-slate-700/50 flex justify-between text-xs text-slate-500">
                    <span>ID: {rx.prescriptionId}</span>
                    <span>Expires: {new Date(rx.expiresAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <Pill className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No active prescriptions right now.</p>
            </div>
          )}
        </div>

        {/* Recent Consultations */}
        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Activity className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-white">Recent Visits</h3>
          </div>

          {consultations.length > 0 ? (
            <div className="relative border-l-2 border-slate-700 ml-3 space-y-6 pb-4">
              {consultations.slice(0, 5).map(c => (
                <div key={c._id} className="relative pl-6">
                  <div className="absolute w-4 h-4 bg-purple-500 rounded-full -left-[9px] top-1 border-4 border-[#0b1120]"></div>
                  <p className="text-xs text-purple-400 font-bold mb-1">{new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  <p className="text-white font-medium text-lg">{c.diagnosis || 'General Checkup'}</p>
                  <p className="text-slate-400 text-sm mt-1">Dr. {c.doctorId?.fullName || 'Unknown'}</p>
                  {c.symptoms && c.symptoms.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {c.symptoms.slice(0, 3).map((sym, i) => (
                        <span key={i} className="text-xs px-2 py-1 bg-slate-800 rounded-md text-slate-300">{sym}</span>
                      ))}
                      {c.symptoms.length > 3 && <span className="text-xs px-2 py-1 bg-slate-800 rounded-md text-slate-300">+{c.symptoms.length - 3}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No recent consultations found.</p>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default function PatientDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const nic = localStorage.getItem('nic') || JSON.parse(localStorage.getItem('user') || '{}').nic;

  useEffect(() => {
    if (!nic) {
      toast.error('Patient NIC not found. Please log in again.');
      navigate('/patient/login');
      return;
    }
    
    api.get(`/patient/${nic}`)
      .then(res => {
        setData(res.data.data || res.data);
      })
      .catch(err => {
        toast.error('Failed to load patient data');
      })
      .finally(() => setLoading(false));
  }, [nic, navigate]);

  const menuItems = [
    { label: 'Overview', path: '/patient/dashboard', icon: LayoutDashboard, end: true },
    { label: 'My Records', path: '/patient/dashboard/records', icon: FileText },
  ];

  return (
    <div className="patient-theme flex min-h-screen bg-[#0b1120]">
      <Sidebar menuItems={menuItems} title="Patient Portal" themePrefix="patient" />
      
      <main className="flex-1 lg:ml-64 p-4 lg:p-8 overflow-y-auto h-screen">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <Routes>
            <Route path="/dashboard" element={<Overview data={data} />} />
            <Route path="/dashboard/records" element={<div className="p-8 text-white">Full Medical History (Coming soon)</div>} />
            <Route path="*" element={<Navigate to="/patient/dashboard" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}