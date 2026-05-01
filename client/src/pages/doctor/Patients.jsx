import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiUser, FiActivity, FiFileText, FiPlus, FiFilter, FiChevronRight } from 'react-icons/fi';
import Sidebar from '../../components/Sidebar';
import PageTransition from '../../components/PageTransition';
import LoadingSkeleton from '../../components/LoadingSkeleton';

const DoctorPatients = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const links = [
    { path: '/doctor/dashboard', label: 'Dashboard', icon: FiActivity },
    { path: '/doctor/consultation/new', label: 'New Consultation', icon: FiPlus },
    { path: '/doctor/patients', label: 'My Patients', icon: FiUser },
    { path: '/doctor/prescriptions', label: 'Prescriptions', icon: FiFileText },
  ];

  useEffect(() => {
    // Mock fetch patients
    setTimeout(() => {
      setPatients([
        { id: '1', nic: '981234567V', name: 'Kamal Perera', age: 45, lastVisit: '2026-04-20', risk: 'low' },
        { id: '2', nic: '852345678V', name: 'Sunil Silva', age: 62, lastVisit: '2026-04-25', risk: 'high' },
        { id: '3', nic: '923456789V', name: 'Nimali Fernando', age: 34, lastVisit: '2026-04-28', risk: 'medium' },
        { id: '4', nic: '751234567V', name: 'Ruwan Bandara', age: 70, lastVisit: '2026-04-10', risk: 'high' },
        { id: '5', nic: '882345678V', name: 'Chamari Attapattu', age: 38, lastVisit: '2026-04-15', risk: 'low' }
      ]);
      setLoading(false);
    }, 800);
  }, []);

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.nic.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex bg-bgLight min-h-screen">
      <Sidebar role="doctor" links={links} userName="Dr. A. Silva" />
      
      <main className="flex-1 md:ml-[280px] p-6 lg:p-10 transition-all duration-300">
        <PageTransition>
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">My Patients</h1>
              <p className="text-gray-500 mt-1">Manage and view patient records</p>
            </div>
            
            <div className="mt-4 md:mt-0 flex space-x-3">
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or NIC..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none w-full md:w-64"
                />
              </div>
              <button className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                <FiFilter className="mr-2" /> Filter
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {loading ? (
              <LoadingSkeleton variant="table" count={5} />
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/50 border-b border-gray-100">
                  <tr className="text-gray-500 text-sm">
                    <th className="px-6 py-4 font-medium">Patient Name</th>
                    <th className="px-6 py-4 font-medium">NIC</th>
                    <th className="px-6 py-4 font-medium">Age</th>
                    <th className="px-6 py-4 font-medium">Last Visit</th>
                    <th className="px-6 py-4 font-medium">Risk Level</th>
                    <th className="px-6 py-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map(patient => (
                    <tr key={patient.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/doctor/patients/${patient.nic}`)}>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold mr-3">
                            {patient.name.charAt(0)}
                          </div>
                          <span className="font-semibold text-gray-800">{patient.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600 font-mono text-sm">{patient.nic}</td>
                      <td className="px-6 py-4 text-gray-600">{patient.age} yrs</td>
                      <td className="px-6 py-4 text-gray-600">{patient.lastVisit}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                          patient.risk === 'high' ? 'bg-red-100 text-red-700' :
                          patient.risk === 'medium' ? 'bg-orange-100 text-orange-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {patient.risk}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <FiChevronRight className="inline-block text-gray-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            
            {!loading && filteredPatients.length === 0 && (
              <div className="p-10 text-center text-gray-500">
                No patients found matching your search.
              </div>
            )}
          </div>
        </PageTransition>
      </main>
    </div>
  );
};

export default DoctorPatients;
