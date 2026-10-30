import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import NotificationToast from './components/common/NotificationToast';
import PrivateRoute from './components/auth/PrivateRoute';
import BanNotice from './components/BanNotice';
import { initGA, usePageTracking } from './utils/analytics';
import AnimatedBackground from './components/common/AnimatedBackground';
import { PatientAccessProvider } from './context/PatientAccessContext';
import { LanguageProvider } from './i18n/LanguageContext';
import IdleTimer from './components/common/IdleTimer';
import PrototypeNotice from './components/common/PrototypeNotice';

// ─── Lazy-loaded route components ──────────────────────────────────────────
// Each import() creates a separate JS chunk that is only downloaded when
// the user navigates to that route.  This cuts the initial bundle from
// ~465 KB gzip (everything) down to the shell + the one page being viewed.

// Public / shared pages (lightweight – loaded on first visit)
const Home              = React.lazy(() => import('./pages/Home'));
const SelectRole        = React.lazy(() => import('./pages/SelectRole'));
const Register          = React.lazy(() => import('./pages/auth/RegistrationEntry'));
const ForgotPassword    = React.lazy(() => import('./pages/public/ForgotPassword'));
const ResetPassword     = React.lazy(() => import('./pages/public/ResetPassword'));

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

// ─── Route Error Boundary (prevents white-screen on render error) ───────────
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Runtime render error captured (sanitized operational notice)');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="glass-panel rounded-2xl p-8 max-w-md w-full text-center space-y-5 border border-white/10">
            <div className="w-12 h-12 mx-auto rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 text-xl font-bold">
              !
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Something went wrong</h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                This page could not be displayed. Reload to continue. If a save was in progress, verify its outcome before submitting again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Inner component that lives inside <Router> so hooks can use useLocation ──
function AppRoutes() {
  // Fires ReactGA.send({ hitType: 'pageview', page: location.pathname }) on
  // every navigation event — covers all role-based dashboards automatically.
  usePageTracking();
  const location = useLocation();

  return (
    <div className="relative min-h-screen text-slate-200 overflow-x-hidden">
      <PrototypeNotice />
      <AnimatedBackground />
      <IdleTimer />
      <NotificationToast />
      <BanNotice />

      <ErrorBoundary key={location.pathname}>
        <Suspense fallback={<PageLoader />}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<Home />} />
          <Route path="/select-role" element={<SelectRole />} />
          <Route path="/register" element={<Register />} />
          <Route path="/patient/register" element={<Navigate to="/register?role=patient" replace />} />
          <Route path="/hospital/register" element={<Navigate to="/register?role=hospital_admin" replace />} />
          <Route path="/pharmacy/register" element={<Navigate to="/register?role=pharmacy" replace />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
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

          <Route element={<PrivateRoute allowedRoles={['pharmacist', 'pharmacy_admin', 'assistant']} />}>
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
      </ErrorBoundary>
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
      <LanguageProvider>
        <AppRoutes />
      </LanguageProvider>
    </Router>
  );
}

export default App;
