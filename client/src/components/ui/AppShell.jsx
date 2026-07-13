import React from 'react';
import Sidebar from '../common/Sidebar';
import NotificationBell from '../common/NotificationBell';

const AppShell = ({
  role = 'doctor',
  userName = '',
  userRole = '',
  menuItems = [],
  children
}) => {
  // Map role to Sidebar's themePrefix and titles
  const roleConfig = {
    doctor: { theme: 'doctor', title: 'Doctor Portal' },
    hospital: { theme: 'hospital', title: 'Hospital Admin' },
    hospital_admin: { theme: 'hospital', title: 'Hospital Admin' },
    labtechnician: { theme: 'hospital', title: 'Hospital Admin' },
    admin: { theme: 'admin', title: 'System Admin' },
    super_admin: { theme: 'admin', title: 'System Admin' },
    pharmacy: { theme: 'pharmacy', title: 'Pharmacy Portal' },
    pharmacist: { theme: 'pharmacy', title: 'Pharmacy Portal' },
    pharmacy_admin: { theme: 'pharmacy', title: 'Pharmacy Portal' },
    patient: { theme: 'patient', title: 'Patient Portal' }
  };

  const current = roleConfig[role.toLowerCase()] || roleConfig.doctor;

  return (
    <div className={`flex min-h-screen bg-transparent text-slate-100 font-sans overflow-x-hidden ${current.theme}-theme`}>
      {/* Sidebar Rail */}
      <Sidebar
        menuItems={menuItems}
        title={current.title}
        themePrefix={current.theme}
        userName={userName}
        userRole={userRole}
      />

      {/* Main Content Layout Wrapper */}
      <div className="flex-1 flex flex-col md:pl-64 min-w-0 transition-all duration-300">
        {/* Topbar/Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 glass-panel border-b-0 border-white/5">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-slate-100 tracking-tight">{current.title}</h1>
            {userName && (
              <p className="text-xs text-slate-400 mt-0.5">
                Welcome back, <span className="font-semibold text-slate-200">{userName}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Desktop Notification Bell */}
            <div className="hidden md:block">
              <NotificationBell />
            </div>

            {/* Profile Avatar Quick Pill */}
            {userName && (
              <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl glass-card border border-white/5">
                <div className="w-6.5 h-6.5 rounded-lg accent-bg accent-border border flex items-center justify-center text-xs font-bold accent-text select-none">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-bold text-slate-300 hidden sm:inline max-w-[120px] truncate">
                  {userName}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppShell;
