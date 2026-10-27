import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import PatientRegister from '../patient/Register';
import DoctorRegister from '../doctor/Register';
import HospitalRegister from '../hospital/Register';
import PharmacyRegister from '../pharmacy/Register';
export function registrationKind(role) {
  return ({patient:'patient',doctor:'doctor',hospital:'hospital',hospital_admin:'hospital',pharmacy:'pharmacy',pharmacy_admin:'pharmacy',pharmacist:'invitation',assistant:'invitation'})[role] || 'denied';
}
export default function RegistrationEntry(){
  const [params]=useSearchParams();const kind=registrationKind(params.get('role')||'patient');
  const Component={patient:PatientRegister,doctor:DoctorRegister,hospital:HospitalRegister,pharmacy:PharmacyRegister}[kind];
  if(Component)return <Component/>;
  return <main className="min-h-screen p-10 text-slate-100"><h1>Account access</h1><p>{kind==='invitation'?'Pharmacy staff accounts must be provisioned by an authorized pharmacy administrator.':'This registration role is not available.'}</p><Link to="/select-role">Return to sign in</Link></main>;
}
