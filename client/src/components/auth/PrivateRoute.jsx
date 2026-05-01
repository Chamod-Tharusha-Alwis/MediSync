import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

const PrivateRoute = ({ allowedRoles = [] }) => {
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('userRole') || localStorage.getItem('role');

  if (!token || !userRole) {
    return <Navigate to="/select-role" replace />;
  }

  // Case-insensitive role check
  const normalizedUserRole = userRole.toLowerCase();
  const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());

  if (normalizedAllowedRoles.length > 0 && !normalizedAllowedRoles.includes(normalizedUserRole)) {
    // Redirect based on actual role
    switch (normalizedUserRole) {
      case 'doctor': return <Navigate to="/doctor/dashboard" replace />;
      case 'hospital_admin': return <Navigate to="/hospital/dashboard" replace />;
      case 'patient': return <Navigate to="/patient/dashboard" replace />;
      case 'pharmacist': 
      case 'pharmacy_admin': return <Navigate to="/pharmacy/dashboard" replace />;
      case 'admin': return <Navigate to="/admin/dashboard" replace />;
      default: return <Navigate to="/select-role" replace />;
    }
  }

  return <Outlet />;
};

export default PrivateRoute;
