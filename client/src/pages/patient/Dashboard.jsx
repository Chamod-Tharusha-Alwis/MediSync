import React from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, HeartPulse, FileText, Pill, User, Clock,
  Calendar, FlaskConical, Stethoscope,
} from 'lucide-react';
// Calendar kept for the Follow-up card below
import api from '../../api/axiosInstance';
import Sidebar from '../../components/common/Sidebar';
import PageTransition from '../../components/common/PageTransition';
import PatientHistory from './History';
import PatientProfile from './Profile';
import ActiveOutbreakBanner from '../../components/common/ActiveOutbreakBanner';

/* ─────────────────────────────────────────────────────────────────────────────
   Overview — the landing page of the patient dashboard
   ───────────────────────────────────────────────────────────────────────────── */
const Overview = ({ data }) => {
  const navigate = useNavigate();

  const patient       = data?.patient       || {};
  const prescriptions = data?.prescriptions || [];
  const consultations = data?.consultations || [];

  if (!data || !patient.fullName) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading your health records...</p>
        </div>
      </div>
    );
  }

  const activeRxs = prescriptions.filter(
    p => (p.status === 'pending' || p.status === 'issued') && new Date(p.expiresAt) > new Date()
  );

  // ── Nearest future follow-up across all consultations ──────────────────────
  const now = new Date();
  const upcomingFollowUp = consultations
    .filter(c => c.followUpDate && new Date(c.followUpDate) > now)
    .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate))[0] || null;

  const followUpDaysAway = upcomingFollowUp
    ? Math.ceil((new Date(upcomingFollowUp.followUpDate) - now) / (1000 * 60 * 60 * 24))
    : null;

  // ── Quick action definitions (3 actions — Booking removed) ────────────────
  const quickActions = [
    {
      label: 'Upload Lab Results',
      icon: FlaskConical,
      gradient: 'from-purple-600 to-violet-500',
      shadow: 'rgba(139,92,246,0.35)',
      id: 'upload-lab-results',
      action: () => {},
    },
    {
      label: 'My Prescriptions',
      icon: Pill,
      gradient: 'from-emerald-600 to-teal-500',
      shadow: 'rgba(16,185,129,0.35)',
      id: 'go-prescriptions',
      action: () => navigate('/patient/dashboard/history'),
    },
    {
      label: 'Medical History',
      icon: FileText,
      gradient: 'from-rose-600 to-pink-500',
      shadow: 'rgba(244,63,94,0.35)',
      id: 'go-history',
      action: () => navigate('/patient/dashboard/history'),
    },
  ];

  return (
    <PageTransition className="p-4 md:p-8">

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Welcome back, {patient.fullName.split(' ')[0]}
        </h1>
        <p className="text-slate-400 mt-1">Here is an overview of your health status.</p>
      </div>

      {/* ── Quick Actions ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {quickActions.map(({ label, icon: Icon, gradient, shadow, id, action }) => (
          <button
            key={id}
            id={id}
            onClick={action}
            className="group flex flex-col items-center gap-2.5 p-5 rounded-2xl border border-white/8 hover:-translate-y-1 hover:border-white/15 transition-all duration-300 cursor-pointer"
            style={{ background: 'rgba(15,23,42,0.58)', backdropFilter: 'blur(16px)' }}
          >
            <div
              className={`p-3 rounded-xl bg-gradient-to-br ${gradient} group-hover:scale-110 transition-transform duration-300`}
              style={{ boxShadow: `0 6px 20px ${shadow}` }}
            >
              <Icon className="w-5 h-5 text-white" />
            </div>
            <span className="text-xs font-semibold text-slate-300 text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Patient Profile Banner ──────────────────────────────────────────── */}
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
                <p className="text-white font-medium">
                  {patient.dateOfBirth
                    ? new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()
                    : 'N/A'}
                </p>
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

      {/* ── Upcoming Follow-up + Stats Row ──────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">

        {/* Upcoming Follow-up Card */}
        <div
          id="upcoming-followup-card"
          className="md:col-span-1 rounded-2xl p-5 border relative overflow-hidden"
          style={{
            background: upcomingFollowUp
              ? 'linear-gradient(135deg, rgba(99,102,241,0.20) 0%, rgba(15,23,42,0.72) 100%)'
              : 'rgba(15,23,42,0.55)',
            backdropFilter: 'blur(20px)',
            borderColor: upcomingFollowUp ? 'rgba(99,102,241,0.32)' : 'rgba(255,255,255,0.07)',
          }}
        >
          <div className="absolute top-0 right-0 opacity-10 p-4">
            <Calendar className="w-20 h-20 text-indigo-400" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 bg-indigo-500/20 rounded-lg">
                <Calendar className="w-4 h-4 text-indigo-400" />
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-400">Upcoming Follow-up</p>
            </div>

            {upcomingFollowUp ? (
              <>
                <p className="text-white font-bold text-lg leading-snug">
                  {new Date(upcomingFollowUp.followUpDate).toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  For: {upcomingFollowUp.diagnosis || 'General Checkup'}
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/25">
                  <Clock className="w-3 h-3 text-indigo-400" />
                  <span className="text-indigo-300 text-xs font-bold">
                    in {followUpDaysAway} day{followUpDaysAway !== 1 ? 's' : ''}
                  </span>
                </div>
                {upcomingFollowUp.followUpNotes && (
                  <p className="text-slate-500 text-xs mt-2 italic">"{upcomingFollowUp.followUpNotes}"</p>
                )}
              </>
            ) : (
              <div className="py-2">
                <p className="text-slate-400 text-sm">No upcoming follow-ups scheduled.</p>
                <p className="text-slate-600 text-xs mt-1">Your doctor will set one after your next visit.</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        {[
          {
            label: 'Total Consultations',
            value: consultations.length,
            icon: Stethoscope,
            textColor: 'text-blue-400',
            bgColor: 'bg-blue-500/15',
            borderColor: 'rgba(59,130,246,0.25)',
          },
          {
            label: 'Active Prescriptions',
            value: activeRxs.length,
            icon: Pill,
            textColor: 'text-emerald-400',
            bgColor: 'bg-emerald-500/15',
            borderColor: 'rgba(16,185,129,0.25)',
          },
        ].map(({ label, value, icon: Icon, textColor, bgColor, borderColor }) => (
          <div
            key={label}
            className="rounded-2xl p-5 border flex flex-col justify-between"
            style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(20px)', borderColor }}
          >
            <div className={`p-3 ${bgColor} rounded-xl w-fit mb-3`}>
              <Icon className={`w-5 h-5 ${textColor}`} />
            </div>
            <div>
              <p className={`text-4xl font-extrabold ${textColor} font-mono`}>{value}</p>
              <p className="text-slate-400 text-sm mt-1">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Active Prescriptions + Recent Visits ────────────────────────────── */}
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
                      <p className="text-white font-bold text-lg">
                        {rx.medications?.length > 0 ? rx.medications[0].name : rx.drugName || 'Prescription'}
                      </p>
                      <p className="text-slate-400 text-sm">Dr. {rx.doctorId?.fullName || 'Doctor'}</p>
                    </div>
                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded uppercase">
                      Ready to pickup
                    </span>
                  </div>
                  {rx.medications?.length > 0 && (
                    <div className="mt-3 text-sm text-slate-300">
                      <p><span className="text-slate-500">Dosage:</span> {rx.medications[0].dosage}</p>
                      <p><span className="text-slate-500">Frequency:</span> {rx.medications[0].frequency}</p>
                    </div>
                  )}
                  {/* Lab test tags */}
                  {rx.labTests?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {rx.labTests.map((t, i) => (
                        <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/25 text-purple-300 text-[10px] font-bold">
                          <FlaskConical className="w-2.5 h-2.5" />{t}
                        </span>
                      ))}
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

          {consultations?.length > 0 ? (
            <div className="relative border-l-2 border-slate-700 ml-3 space-y-6 pb-4">
              {consultations.slice(0, 5).map(c => (
                <div key={c._id} className="relative pl-6">
                  <div className="absolute w-4 h-4 bg-purple-500 rounded-full -left-[9px] top-1 border-4 border-[#0b1120]" />
                  <p className="text-xs text-purple-400 font-bold mb-1">
                    {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  <p className="text-white font-medium text-lg">{c.diagnosis || 'General Checkup'}</p>
                  <p className="text-slate-400 text-sm mt-1">Dr. {c.doctorId?.fullName || 'Unknown'}</p>
                  {c.symptoms?.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {c.symptoms.slice(0, 3).map((sym, i) => (
                        <span key={i} className="text-xs px-2 py-1 bg-slate-800 rounded-md text-slate-300">{sym}</span>
                      ))}
                      {c.symptoms.length > 3 && (
                        <span className="text-xs px-2 py-1 bg-slate-800 rounded-md text-slate-300">+{c.symptoms.length - 3}</span>
                      )}
                    </div>
                  )}
                  {/* Lab test tags on the visit card */}
                  {c.labTests?.length > 0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {c.labTests.map((t, i) => (
                        <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/25 text-purple-300 text-[10px] font-bold">
                          <FlaskConical className="w-2.5 h-2.5" />{t}
                        </span>
                      ))}
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

/* ─────────────────────────────────────────────────────────────────────────────
   PatientDashboard — root layout with sidebar + route shell
   ───────────────────────────────────────────────────────────────────────────── */
export default function PatientDashboard() {
  const navigate = useNavigate();

  // Prefer the flat 'nic' key; fall back to JSON user object
  let nic = localStorage.getItem('nic');
  if (!nic) {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try { nic = JSON.parse(userStr).nic; } catch (e) {}
    }
  }

  const { data: queryData, isLoading, isError, error } = useQuery({
    queryKey: ['patientDashboard', nic],
    queryFn: async () => {
      const [patientRes, timelineRes] = await Promise.all([
        api.get(`/patient/${nic}`),
        api.get(`/patient/${nic}/timeline`),
      ]);

      console.log("DASHBOARD DATA (Patient):", patientRes.data);
      console.log("DASHBOARD DATA (Timeline):", timelineRes.data);

      const timeline = timelineRes.data.data || [];
      return {
        patient:       patientRes.data.data,
        prescriptions: timeline.filter(e => e.type === 'prescription').map(e => e.data),
        consultations: timeline.filter(e => e.type === 'consultation').map(e => e.data),
      };
    },
    enabled:   !!nic,
    retry:     1,
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
    { label: 'Overview',        path: '/patient/dashboard',        icon: LayoutDashboard, end: true },
    { label: 'Medical History', path: '/patient/dashboard/history', icon: FileText },
    { label: 'My Profile',      path: '/patient/dashboard/profile', icon: User },
  ];

  return (
    <div className="patient-theme flex flex-col min-h-screen bg-[#0b1120]">
      <ActiveOutbreakBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar menuItems={menuItems} title="Patient Portal" themePrefix="patient" />

        <main className="flex-1 lg:ml-64 p-4 lg:p-8 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
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
              <Route path="/dashboard"              element={<Overview data={data} />} />
              <Route path="/dashboard/history"      element={<PatientHistory />} />
              {/* Redirect legacy /prescriptions URL to the unified Medical History page */}
              <Route path="/dashboard/prescriptions" element={<Navigate to="/patient/dashboard/history" replace />} />
              <Route path="/dashboard/profile"      element={<PatientProfile />} />
              <Route path="*"                       element={<Navigate to="/patient/dashboard" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </div>
  );
}