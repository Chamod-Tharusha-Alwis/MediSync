import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axiosInstance';
import { FiArrowLeft, FiActivity, FiPlus, FiUser, FiFileText } from 'react-icons/fi';
import Sidebar from '../../components/Sidebar';
import PageTransition from '../../components/PageTransition';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import MedicalTimeline from '../../components/MedicalTimeline';

const DoctorPatientDetail = () => {
  const { nic } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const links = [
    { path: '/doctor/dashboard', label: 'Dashboard', icon: FiActivity },
    { path: '/doctor/consultation/new', label: 'New Consultation', icon: FiPlus },
    { path: '/doctor/patients', label: 'My Patients', icon: FiUser },
    { path: '/doctor/prescriptions', label: 'Prescriptions', icon: FiFileText },
  ];

  useEffect(() => {
    const fetchPatientData = async () => {
      try {
        setLoading(true);
        const patientRes = await axiosInstance.get(`/patient/${nic}`);
        const timelineRes = await axiosInstance.get(`/patient/${nic}/timeline`);
        
        setPatient(patientRes.data.data);
        setEvents(timelineRes.data.data);
      } catch (err) {
        console.error('Failed to fetch patient data', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchPatientData();
  }, [nic]);

  return (
    <div className="flex bg-bgLight min-h-screen">
      <Sidebar role="doctor" links={links} userName="Dr. A. Silva" />
      
      <main className="flex-1 md:ml-[280px] p-6 lg:p-10 transition-all duration-300">
        <PageTransition>
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center text-gray-500 hover:text-primary mb-6 transition-colors"
          >
            <FiArrowLeft className="mr-2" /> Back to Patients
          </button>

          {loading ? (
            <LoadingSkeleton variant="profile" />
          ) : (
            <>
              {/* Patient Header */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 mb-8 flex flex-col md:flex-row md:items-center justify-between">
                <div className="flex items-center mb-6 md:mb-0">
                  <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-2xl mr-6">
                    {patient.fullName.charAt(0)}
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-800">{patient.fullName}</h1>
                    <p className="text-gray-500 font-mono text-sm mt-1">NIC: {patient.nic}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 md:gap-8 text-sm">
                  <div>
                    <p className="text-gray-400 font-semibold mb-1 uppercase text-xs">Age / Gender</p>
                    <p className="font-bold text-gray-800">{patient?.age || 'N/A'} / {patient?.gender || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 font-semibold mb-1 uppercase text-xs">Blood Group</p>
                    <p className="font-bold text-red-600">{patient?.bloodGroup || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 font-semibold mb-1 uppercase text-xs">Allergies</p>
                    <p className="font-bold text-orange-600">{patient?.allergies?.join(', ') || 'None'}</p>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                  <h2 className="text-xl font-bold text-gray-800">Medical History</h2>
                  <button 
                    onClick={() => navigate('/doctor/consultation/new')}
                    className="bg-primary/10 text-primary hover:bg-primary hover:text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  >
                    + New Consultation
                  </button>
                </div>
                
                <MedicalTimeline events={events} />
              </div>
            </>
          )}
        </PageTransition>
      </main>
    </div>
  );
};

export default DoctorPatientDetail;
