import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import NotificationToast from './components/common/NotificationToast';
import PrivateRoute from './components/auth/PrivateRoute';
import BanNotice from './components/BanNotice';
import { initGA, usePageTracking } from './utils/analytics';
import AnimatedBackground from './components/common/AnimatedBackground';
import { PatientAccessProvider } from './context/PatientAccessContext';
import IdleTimer from './components/common/IdleTimer';

// ─── Lazy-loaded route components ──────────────────────────────────────────
// Each import() creates a separate JS chunk that is only downloaded when
// the user navigates to that route.  This cuts the initial bundle from
// ~465 KB gzip (everything) down to the shell + the one page being viewed.

// Public / shared pages (lightweight – loaded on first visit)
const Home              = React.lazy(() => import('./pages/Home'));
const SelectRole        = React.lazy(() => import('./pages/SelectRole'));
const Register          = React.lazy(() => import('./pages/auth/Register'));
const StyleGuide        = React.lazy(() => import('./pages/dev/StyleGuide'));
const ResetPassword     = React.lazy(() => import('./pages/common/ResetPassword'));

// Public directory pages
const DoctorDirectory   = React.lazy(() => import('./pages/public/DoctorDirectory'));
const HospitalDirectory = React.lazy(() => import('./pages/public/HospitalDirectory'));
const PharmacyDirectory = React.lazy(() => import('./pages/public/PharmacyDirectory'));
const PublicHealth      = React.lazy(() => import('./pages/public/PublicHealth'));

// Login pages
const AdminLogin        = React.lazy(() => import('./pages/admin/Login'));
const PatientLogin      = React.lazy(() => import('./pages/patient/Login'));
const DoctorLogin       = React.lazy(() => import('./pages/doctor/Login'));
const HospitalLogin     = React.lazy(() => import('./pages/hospital/Login'));
const PharmacyLogin     = React.lazy(() => import('./pages/pharmacy/Login'));

// Doctor portal
const DoctorRoleSelection = React.lazy(() => import('./pages/doctor/DoctorRoleSelection'));
const DoctorRegister    = React.lazy(() => import('./pages/doctor/Register'));
const ChangeOrgPassword = React.lazy(() => import('./pages/doctor/ChangeOrgPassword'));
const DoctorDashboard   = React.lazy(() => import('./pages/doctor/Dashboard'));
const NewConsultation   = React.lazy(() => import('./pages/doctor/NewConsultation'));
const PatientDetail     = React.lazy(() => import('./pages/doctor/PatientDetail'));
const DoctorProfile     = React.lazy(() => import('./pages/doctor/Profile'));

// Other role dashboards
const HospitalDashboard = React.lazy(() => import('./pages/hospital/Dashboard'));
const PatientDashboard  = React.lazy(() => import('./pages/patient/Dashboard'));
const PharmacyDashboard = React.lazy(() => import('./pages/pharmacy/Dashboard'));
const AdminDashboard    = React.lazy(() => import('./pages/admin/Dashboard'));

// ─── Suspense fallback (minimal spinner) ────────────────────────────────────
const PageLoader = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1120]">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-400 text-sm font-medium tracking-wide">Loading…</p>
    </div>
  </div>
);

// ─── Inner component that lives inside <Router> so hooks can use useLocation ──
function AppRoutes() {
  // Fires ReactGA.send({ hitType: 'pageview', page: location.pathname }) on
  // every navigation event — covers all role-based dashboards automatically.
  usePageTracking();
  const location = useLocation();

  return (
    <div className="relative min-h-screen text-slate-200 overflow-x-hidden">
      <AnimatedBackground />
      <IdleTimer />
      <NotificationToast />
      <BanNotice />

      <Suspense fallback={<PageLoader />}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Home />} />
          <Route path="/select-role" element={<SelectRole />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dev/style-guide" element={<StyleGuide />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          
          {/* Public Directories */}
          <Route path="/doctors" element={<DoctorDirectory />} />
          <Route path="/hospitals" element={<HospitalDirectory />} />
          <Route path="/pharmacies" element={<PharmacyDirectory />} />
          <Route path="/public-health" element={<PublicHealth />} />

          {/* Auth Routes */}
          <Route path="/doctor/select-role" element={<DoctorRoleSelection />} />
          <Route path="/doctor/login" element={<DoctorLogin />} />
          <Route path="/doctor/register" element={<DoctorRegister />} />
          <Route path="/doctor/change-org-password" element={<ChangeOrgPassword />} />
          <Route path="/hospital/login" element={<HospitalLogin />} />
          <Route path="/patient/login" element={<PatientLogin />} />
          <Route path="/pharmacy/login" element={<PharmacyLogin />} />
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* Protected Portals */}
          <Route path="/doctor" element={
            <PatientAccessProvider>
              <PrivateRoute allowedRoles={['doctor']} />
            </PatientAccessProvider>
          }>
            <Route path="dashboard" element={<DoctorDashboard />} />
            <Route path="consultation/new" element={<NewConsultation />} />
            <Route path="patients/:nic" element={<PatientDetail />} />
            <Route path="profile" element={<DoctorProfile />} />
            {/* Fallback for /doctor */}
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>

          <Route element={<PrivateRoute allowedRoles={['hospital_admin']} />}>
            <Route path="/hospital/*" element={<HospitalDashboard />} />
          </Route>

          <Route element={<PrivateRoute allowedRoles={['patient']} />}>
            <Route path="/patient/*" element={<PatientDashboard />} />
          </Route>

          <Route element={<PrivateRoute allowedRoles={['pharmacist', 'pharmacy_admin']} />}>
            <Route path="/pharmacy/*" element={<PharmacyDashboard />} />
          </Route>

          <Route element={<PrivateRoute allowedRoles={['admin', 'super_admin']} />}>
            <Route path="/admin/*" element={<AdminDashboard />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/select-role" replace />} />
          </Routes>
        </AnimatePresence>
      </Suspense>
    </div>
  );
}

function App() {
  // Initialise GA4 once on mount, before any navigation events fire.
  useEffect(() => {
    initGA();
  }, []);

  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;