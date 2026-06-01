import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Building2, MapPin, Phone, Globe, PhoneCall } from 'lucide-react';
import api from '../../api/axiosInstance';

const HospitalDirectory = () => {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchHospitals = async () => {
      try {
        const res = await api.get('/public/hospitals');
        setHospitals(res.data.data);
      } catch (err) {
        console.error('Failed to fetch hospitals', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHospitals();
  }, []);

  const filteredHospitals = hospitals.filter(h => 
    h.name?.toLowerCase().includes(search.toLowerCase()) || 
    h.district?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-6">
        
        {/* Header & Search */}
        <div className="text-center mb-12">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-4"
          >
            Registered Medical Facilities
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-slate-500 mb-8 max-w-2xl mx-auto"
          >
            Find public and private hospitals seamlessly connected to the MediSync ecosystem.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="relative max-w-xl mx-auto"
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search by hospital name or district..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-full border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-lg transition-shadow bg-white"
            />
          </motion.div>
        </div>

        {/* Directory Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {filteredHospitals.map((hospital, idx) => (
                <motion.div
                  key={hospital._id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                  whileHover={{ scale: 1.03, y: -5 }}
                  className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-xl transition-shadow flex flex-col"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-md">
                      <Building2 className="w-7 h-7" />
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${hospital.type === 'government' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {hospital.type}
                    </span>
                  </div>
                  
                  <h3 className="text-xl font-bold text-slate-800 mb-1 line-clamp-1">{hospital.name}</h3>
                  <div className="flex items-center gap-1.5 text-indigo-600 font-medium text-sm mb-4">
                    <MapPin className="w-4 h-4" />
                    {hospital.district || 'Unknown District'}
                  </div>
                  
                  <div className="space-y-3 text-sm text-slate-600 flex-1">
                    {hospital.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 opacity-50 mt-0.5" />
                        <span className="line-clamp-2 leading-tight">{hospital.address}</span>
                      </div>
                    )}
                    {hospital.contactPhone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 opacity-50" />
                        <span>{hospital.contactPhone}</span>
                      </div>
                    )}
                    {hospital.emergencyHotline && (
                      <div className="flex items-center gap-2 text-rose-600 font-bold">
                        <PhoneCall className="w-4 h-4 opacity-80" />
                        <span>Emergency: {hospital.emergencyHotline}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        
        {!loading && filteredHospitals.length === 0 && (
          <div className="text-center py-20 text-slate-500">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg">No hospitals found matching "{search}"</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HospitalDirectory;
