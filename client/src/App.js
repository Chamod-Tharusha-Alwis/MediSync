import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import NotificationToast from './components/common/NotificationToast';
import PrivateRoute from './components/auth/PrivateRoute';
import BanNotice from './components/BanNotice';
import { initGA, usePageTracking } from './utils/analytics';

import AdminLogin from './pages/admin/Login';
import PatientLogin from './pages/patient/Login';
import DoctorLogin from './pages/doctor/Login';
import HospitalLogin from './pages/hospital/Login';
import PharmacyLogin from './pages/pharmacy/Login';
import Register from './pages/auth/Register';
import Home from './pages/Home';
import DoctorDirectory from './pages/public/DoctorDirectory';
import HospitalDirectory from './pages/public/HospitalDirectory';
import PharmacyDirectory from './pages/public/PharmacyDirectory';

// Dashboards
import SelectRole from './pages/SelectRole';
import DoctorDashboard from './pages/doctor/Dashboard';
import NewConsultation from './pages/doctor/NewConsultation';
import PatientDirectory from './pages/doctor/PatientDirectory';
import PatientDetail from './pages/doctor/PatientDetail';
import DoctorProfile from './pages/doctor/Profile';
import DoctorRegister from './pages/doctor/Register';
import DoctorRoleSelection from './pages/doctor/DoctorRoleSelection';
import ChangeOrgPassword from './pages/doctor/ChangeOrgPassword';
import HospitalDashboard from './pages/hospital/Dashboard';
import PatientDashboard from './pages/patient/Dashboard';
import PharmacyDashboard from './pages/pharmacy/Dashboard';
import AdminDashboard from './pages/admin/Dashboard';

// ─── Inner component that lives inside <Router> so hooks can use useLocation ──
function AppRoutes() {
  // Fires ReactGA.send({ hitType: 'pageview', page: location.pathname }) on
  // every navigation event — covers all role-based dashboards automatically.
  usePageTracking();

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200">
      <NotificationToast />
      <BanNotice />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/select-role" element={<SelectRole />} />
        <Route path="/register" element={<Register />} />
        
        {/* Public Directories */}
        <Route path="/doctors" element={<DoctorDirectory />} />
        <Route path="/hospitals" element={<HospitalDirectory />} />
        <Route path="/pharmacies" element={<PharmacyDirectory />} />

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
        <Route path="/doctor" element={<PrivateRoute allowedRoles={['doctor']} />}>
          <Route path="dashboard" element={<DoctorDashboard />} />
          <Route path="consultation/new" element={<NewConsultation />} />
          <Route path="patients" element={<PatientDirectory />} />
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