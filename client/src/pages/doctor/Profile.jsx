import React, { useState } from 'react';
import { FiActivity, FiPlus, FiUser, FiFileText, FiSave } from 'react-icons/fi';
import Sidebar from '../../components/Sidebar';
import PageTransition from '../../components/PageTransition';

const DoctorProfile = () => {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({
    fullName: 'Dr. A. Silva',
    specialization: 'Cardiologist',
    personalEmail: 'asilva@example.com',
    doctorId: 'DR-102945'
  });

  const links = [
    { path: '/doctor/dashboard', label: 'Dashboard', icon: FiActivity },
    { path: '/doctor/consultation/new', label: 'New Consultation', icon: FiPlus },
    { path: '/doctor/patients', label: 'My Patients', icon: FiUser },
    { path: '/doctor/prescriptions', label: 'Prescriptions', icon: FiFileText },
  ];

  const handleSave = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      // In a real app, toast success here
    }, 1000);
  };

  return (
    <div className="flex bg-bgLight min-h-screen">
      <Sidebar role="doctor" links={links} userName={profile.fullName} />
      
      <main className="flex-1 md:ml-[280px] p-6 lg:p-10 transition-all duration-300">
        <PageTransition>
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800">My Profile</h1>
            <p className="text-gray-500 mt-1">Manage your personal and professional information</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden max-w-3xl">
            <div className="p-8">
              <div className="flex items-center space-x-6 mb-8">
                <div className="w-24 h-24 rounded-full bg-primary/10 text-primary flex items-center justify-center text-4xl font-bold">
                  {profile.fullName.charAt(4)} {/* Skipping "Dr. " */}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">{profile.fullName}</h2>
                  <p className="text-primary font-medium">{profile.specialization}</p>
                  <p className="text-gray-500 text-sm mt-1">Reg No: {profile.doctorId}</p>
                </div>
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input 
                      type="text" 
                      value={profile.fullName}
                      onChange={(e) => setProfile({...profile, fullName: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Specialization</label>
                    <input 
                      type="text" 
                      value={profile.specialization}
                      onChange={(e) => setProfile({...profile, specialization: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Personal Email</label>
                    <input 
                      type="email" 
                      value={profile.personalEmail}
                      onChange={(e) => setProfile({...profile, personalEmail: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-100 flex justify-end">
                  <button 
                    type="submit"
                    disabled={loading}
                    className="bg-primary hover:bg-primaryDark text-white px-8 py-3 rounded-xl font-bold flex items-center transition-colors disabled:opacity-50"
                  >
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div> : <FiSave className="mr-2" />}
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </PageTransition>
      </main>
    </div>
  );
};

export default DoctorProfile;
