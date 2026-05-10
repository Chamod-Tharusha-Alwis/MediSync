import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { LayoutDashboard, HeartPulse, FileText, Pill, User, Clock } from 'lucide-react';
import api from '../../api/axiosInstance';
import Sidebar from '../../components/common/Sidebar';
import PageTransition from '../../components/common/PageTransition';
import PatientHistory from './History';
import PatientPrescriptions from './Prescriptions';
import PatientProfile from './Profile';

const Overview = ({ data }) => {
  // Safe destructuring with fallbacks
  const patient = data?.patient || {};
  const prescriptions = data?.prescriptions || [];
  const consultations = data?.consultations || [];

  if (!data || !patient.fullName) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">Loading your health records...</p>
        </div>
      </div>
    );
  }

  const activeRxs = prescriptions.filter(p => p.status === 'issued' && new Date(p.expiresAt) > new Date());

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
              <Clock className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-white">Recent Visits</h3>
          </div>

          {consultations && consultations.length > 0 ? (
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
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No recent consultations found.</p>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default function PatientDashboard() {
  const navigate = useNavigate();
  // Ensure we consistently use 'nic' as standard key
  let nic = localStorage.getItem('nic');
  if (!nic) {
    // Check fallback just in case, but prefer 'nic'
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try { nic = JSON.parse(userStr).nic; } catch(e) {}
    }
  }

  const { data: queryData, isLoading, isError, error } = useQuery({
    queryKey: ['patientDashboard', nic],
    queryFn: async () => {
      const [patientRes, timelineRes] = await Promise.all([
        api.get(`/patient/${nic}`),
        api.get(`/patient/${nic}/timeline`)
      ]);

      const timeline = timelineRes.data.data || [];
      return {
        patient: patientRes.data.data,
        prescriptions: timeline.filter(e => e.type === 'prescription').map(e => e.data),
        consultations: timeline.filter(e => e.type === 'consultation').map(e => e.data)
      };
    },
    enabled: !!nic,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  if (!nic) return (
    <div className="flex h-screen items-center justify-center bg-[#0b1120]">
      <div className="text-center p-8 bg-slate-900 rounded-2xl border border-slate-800">
        <p className="text-red-500 font-semibold mb-2">Session expired.</p>
        <p className="text-slate-400 text-sm mb-4">Please log in again to access your records.</p>
        <button onClick={() => navigate('/patient/login')} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl transition-colors">
          Go to Login
        </button>
      </div>
    </div>
  );

  const data = queryData;

  const menuItems = [
    { label: 'Overview', path: '/patient/dashboard', icon: LayoutDashboard, end: true },
    { label: 'Medical History', path: '/patient/dashboard/history', icon: FileText },
    { label: 'Prescriptions', path: '/patient/dashboard/prescriptions', icon: Pill },
    { label: 'My Profile', path: '/patient/dashboard/profile', icon: User },
  ];

  return (
    <div className="patient-theme flex min-h-screen bg-[#0b1120]">
      <Sidebar menuItems={menuItems} title="Patient Portal" themePrefix="patient" />
      
      <main className="flex-1 lg:ml-64 p-4 lg:p-8 overflow-y-auto h-screen">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : isError ? (
          <div className="flex h-full items-center justify-center p-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-md w-full text-center">
              <p className="text-red-400 font-semibold mb-2">Failed to load your records</p>
              <p className="text-red-500/70 text-sm mb-6">
                {error?.response?.data?.error || error?.message || 'Unknown error'}
              </p>
              <button onClick={() => window.location.reload()} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded transition-colors text-sm font-medium">
                Retry
              </button>
            </div>
          </div>
        ) : !data ? (
          <div className="text-center p-8 text-slate-500 mt-20">No data found</div>
        ) : (
          <Routes>
            <Route path="/dashboard" element={<Overview data={data} />} />
            <Route path="/dashboard/history" element={<PatientHistory />} />
            <Route path="/dashboard/prescriptions" element={<PatientPrescriptions />} />
            <Route path="/dashboard/profile" element={<PatientProfile />} />
            <Route path="*" element={<Navigate to="/patient/dashboard" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}