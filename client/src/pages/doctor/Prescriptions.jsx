import React, { useState, useEffect } from 'react';
import { FiSearch, FiActivity, FiPlus, FiUser, FiFileText, FiFilter } from 'react-icons/fi';
import Sidebar from '../../components/Sidebar';
import PageTransition from '../../components/PageTransition';
import LoadingSkeleton from '../../components/LoadingSkeleton';

const DoctorPrescriptions = () => {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const links = [
    { path: '/doctor/dashboard', label: 'Dashboard', icon: FiActivity },
    { path: '/doctor/consultation/new', label: 'New Consultation', icon: FiPlus },
    { path: '/doctor/patients', label: 'My Patients', icon: FiUser },
    { path: '/doctor/prescriptions', label: 'Prescriptions', icon: FiFileText },
  ];

  useEffect(() => {
    setTimeout(() => {
      setPrescriptions([
        { id: '1', patientName: 'Kamal Perera', nic: '981234567V', drug: 'Losartan', date: '2026-04-20', status: 'issued' },
        { id: '2', patientName: 'Sunil Silva', nic: '852345678V', drug: 'Metformin', date: '2026-04-21', status: 'dispensed' },
        { id: '3', patientName: 'Nimali Fernando', nic: '923456789V', drug: 'Amoxicillin', date: '2026-04-25', status: 'expired' },
      ]);
      setLoading(false);
    }, 800);
  }, []);

  const filtered = prescriptions.filter(p => 
    p.patientName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.nic.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.drug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex bg-bgLight min-h-screen">
      <Sidebar role="doctor" links={links} userName="Dr. A. Silva" />
      
      <main className="flex-1 md:ml-[280px] p-6 lg:p-10 transition-all duration-300">
        <PageTransition>
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Prescriptions</h1>
              <p className="text-gray-500 mt-1">Track prescriptions issued by you</p>
            </div>
            
            <div className="mt-4 md:mt-0 flex space-x-3">
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
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
                    <th className="px-6 py-4 font-medium">Patient</th>
                    <th className="px-6 py-4 font-medium">NIC</th>
                    <th className="px-6 py-4 font-medium">Drug</th>
                    <th className="px-6 py-4 font-medium">Issue Date</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-800">{p.patientName}</td>
                      <td className="px-6 py-4 text-gray-600 font-mono text-sm">{p.nic}</td>
                      <td className="px-6 py-4 text-gray-800 font-semibold">{p.drug}</td>
                      <td className="px-6 py-4 text-gray-600">{p.date}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                          p.status === 'issued' ? 'bg-blue-100 text-blue-700' :
                          p.status === 'dispensed' ? 'bg-green-100 text-green-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            
            {!loading && filtered.length === 0 && (
              <div className="p-10 text-center text-gray-500">
                No prescriptions found.
              </div>
            )}
          </div>
        </PageTransition>
      </main>
    </div>
  );
};

export default DoctorPrescriptions;
