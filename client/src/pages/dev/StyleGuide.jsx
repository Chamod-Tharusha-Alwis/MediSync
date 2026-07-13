import React, { useState } from 'react';
import StatusBadge from '../../components/ui/StatusBadge';
import OtpInput from '../../components/ui/OtpInput';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import { Home, User, Settings, ShieldAlert, Database } from 'lucide-react';

const StyleGuide = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');
  const [isToastOpen, setIsToastOpen] = useState(false);

  // Mock handlers
  const handleOtpSubmit = (code) => {
    showToast(`OTP Submitted Successfully: ${code}`, 'success');
  };

  const handleOtpResend = () => {
    showToast('OTP Resent to your email!', 'info');
  };

  const showToast = (msg, type) => {
    setToastMessage(msg);
    setToastType(type);
    setIsToastOpen(true);
  };

  // Mock Menu Items for AppShell demonstration
  const mockMenuItems = [
    { path: '#', label: 'Dashboard', icon: Home },
    { path: '#', label: 'Profile', icon: User },
    { path: '#', label: 'Settings', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-[#020817] text-slate-100 p-8 font-sans relative overflow-x-hidden">
      {/* Toast Notification Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        <Toast
          message={toastMessage}
          type={toastType}
          isOpen={isToastOpen}
          onClose={() => setIsToastOpen(false)}
        />
      </div>

      <header className="mb-12 border-b border-white/5 pb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
            <Database className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">MediSync Redesign Style Guide</h1>
        </div>
        <p className="text-slate-400">AntiGravity 2.0 Unified Design System Catalog (Prompt 0 Component Inventory)</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 1. STATUS BADGES */}
        <section className="glass-card p-6 border border-white/5 flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">1. StatusBadges</h2>
            <p className="text-sm text-slate-400">Component mapping patient, consultation, and report state indicators.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <StatusBadge status="pending" />
            <StatusBadge status="approved" />
            <StatusBadge status="completed" />
            <StatusBadge status="dispensed" />
            <StatusBadge status="expired" />
            <StatusBadge status="banned" />
            <StatusBadge status="suspended" />
            <StatusBadge status="report_ready" />
            <StatusBadge status="sample_collected" />
            <StatusBadge status="processing" />
            <StatusBadge status="delivered" />
          </div>
        </section>

        {/* 2. OTP INPUT GATES */}
        <section className="glass-card p-6 border border-white/5 flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">2. OTP Input</h2>
            <p className="text-sm text-slate-400">Segmented multi-box credential verification widget with auto-focus shifting.</p>
          </div>
          <div className="border border-white/5 rounded-xl bg-slate-950/40 p-4">
            <OtpInput onSubmit={handleOtpSubmit} onResend={handleOtpResend} initialSeconds={120} />
          </div>
        </section>

        {/* 3. MODALS & DIALOGS */}
        <section className="glass-card p-6 border border-white/5 flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">3. Modal Shell</h2>
            <p className="text-sm text-slate-400">Responsive overlay containers with spring physics and backdrop-blur styling.</p>
          </div>
          <div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="glass-button text-sm"
            >
              Open Redesigned Modal
            </button>
          </div>
          <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Interactive UI Sandbox" size="md">
            <div className="flex flex-col gap-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                This modal implements a full backdrop blur overlay alongside scale-transition physics. You can add form actions, reports, or lists inside.
              </p>
              <div className="flex items-center gap-3 p-3.5 rounded-xl border border-white/5 bg-slate-950/50">
                <ShieldAlert className="w-5 h-5 text-teal-400 flex-shrink-0" />
                <span className="text-xs text-slate-400">Zero-Trust consent checks are applied functionally on submit.</span>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    showToast('Action confirmed in Modal!', 'success');
                  }}
                  className="glass-button text-xs"
                >
                  Confirm Action
                </button>
              </div>
            </div>
          </Modal>
        </section>

        {/* 4. TOAST NOTIFICATIONS */}
        <section className="glass-card p-6 border border-white/5 flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">4. Toast & Alerts</h2>
            <p className="text-sm text-slate-400">Action response notifications featuring animated entries/exits.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => showToast('Process finished successfully!', 'success')}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 transition-all"
            >
              Trigger Success
            </button>
            <button
              onClick={() => showToast('An unexpected server error occurred.', 'error')}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/10 border border-rose-500/25 text-rose-400 hover:bg-rose-500/20 transition-all"
            >
              Trigger Error
            </button>
            <button
              onClick={() => showToast('Incoming socket alert received.', 'info')}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-500/10 border border-blue-500/25 text-blue-400 hover:bg-blue-500/20 transition-all"
            >
              Trigger Info
            </button>
          </div>
        </section>

        {/* 5. EMPTY STATES */}
        <section className="glass-card p-6 border border-white/5 flex flex-col gap-6 lg:col-span-2">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">5. Empty State Panel</h2>
            <p className="text-sm text-slate-400">Fallback component rendering list vacancy or missing search matches.</p>
          </div>
          <div className="p-4 rounded-xl border border-white/5 bg-slate-950/20">
            <EmptyState
              icon={ShieldAlert}
              title="No Pending Prescriptions Found"
              description="This patient does not have any active medication orders waiting for dispensation."
              actionText="Search Alternative NIC"
              onAction={() => showToast('NIC Search triggered!', 'info')}
            />
          </div>
        </section>

        {/* 6. SKELETON LOADERS */}
        <section className="glass-card p-6 border border-white/5 flex flex-col gap-6 lg:col-span-2">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">6. Skeleton Loaders</h2>
            <p className="text-sm text-slate-400">Shimmering gradient pulsing placeholder cells to mitigate loading friction.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-3 p-4 rounded-xl border border-white/5 bg-slate-950/20">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Atomic Loaders</h4>
              <div className="flex items-center gap-3">
                <Skeleton.Circle size="w-10 h-10" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <Skeleton.Line width="w-1/2" height="h-3" />
                  <Skeleton.Line width="w-1/4" height="h-2" />
                </div>
              </div>
            </div>
            <Skeleton.Card />
          </div>
        </section>

        {/* 7. APPSHELL (SIDEBAR + TOPBAR + BELL) */}
        <section className="glass-card p-6 border border-white/5 flex flex-col gap-6 lg:col-span-2">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">7. AppShell & Sidebar Layout</h2>
            <p className="text-sm text-slate-400">Layout shell that unifies the sidebar navigation, top bar notification system, and responsive content wrapper.</p>
          </div>
          <div className="p-4 rounded-xl border border-white/5 bg-slate-950/20 overflow-hidden">
            <p className="text-xs text-slate-400 mb-4">Simulated preview of the AppShell with Doctor role sidebar settings and unified topbar.</p>
            <div className="relative border border-white/10 rounded-xl overflow-hidden bg-[#020817] h-60 flex">
              {/* Sidebar */}
              <div className="w-48 border-r border-white/5 bg-[#080c1c]/90 p-4 flex flex-col gap-4">
                <div className="font-extrabold text-emerald-400 text-sm tracking-wide">Doctor Portal</div>
                <div className="flex flex-col gap-1.5 flex-1">
                  {mockMenuItems.map((item, i) => (
                    <div key={i} className={`flex items-center gap-2 p-2 rounded-lg text-xs font-semibold ${i === 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'text-slate-400 hover:bg-white/5'} cursor-pointer`}>
                      <item.icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Content Panel */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="h-12 border-b border-white/5 px-4 flex items-center justify-between bg-slate-900/40">
                  <span className="text-xs font-bold text-slate-400">Welcome back, Dr. Amal</span>
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse-subtle" />
                </div>
                <div className="p-4 text-xs text-slate-500">Simulated main layout workspace container.</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default StyleGuide;
