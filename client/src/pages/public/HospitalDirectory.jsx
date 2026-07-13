import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Building2, MapPin, Phone, PhoneCall, Star, ArrowRight } from 'lucide-react';
import api from '../../api/axiosInstance';
import PublicNavbar from '../../components/common/PublicNavbar';
import HospitalProfileModal from './HospitalProfileModal';
import PageTransition from '../../components/common/PageTransition';

const HospitalDirectory = () => {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedHospital, setSelectedHospital] = useState(null);

  useEffect(() => {
    const fetchHospitals = async () => {
      try {
        const res = await api.get('/public/hospitals');
        setHospitals(res.data.data || []);
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
    <PageTransition className="min-h-screen bg-[#0b1120] text-slate-200 pt-28 pb-12 px-6">
      <PublicNavbar />
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header & Search */}
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
            Medical Facilities Network
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Locate registered private and public sector healthcare centers, emergency departments, and affiliated clinics.
          </p>
          
          <div className="relative max-w-lg mx-auto pt-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4.5 h-4.5 select-none" />
            <input 
              type="text" 
              placeholder="Search by hospital name or district..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-white/5 bg-slate-900/60 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-lg"
            />
          </div>
        </div>

        {/* Directory Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4 animate-pulse select-none">
                <div className="flex justify-between items-start">
                  <div className="w-14 h-14 rounded-xl bg-slate-800" />
                  <div className="w-16 h-6 rounded bg-slate-800" />
                </div>
                <div className="h-4 bg-slate-800 rounded w-2/3" />
                <div className="h-3 bg-slate-800 rounded w-1/2" />
                <div className="space-y-2 pt-2">
                  <div className="h-3 bg-slate-850 rounded w-5/6" />
                  <div className="h-3 bg-slate-850 rounded w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
            <AnimatePresence>
              {filteredHospitals.map((hospital, idx) => (
                <motion.div
                  key={hospital._id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, delay: idx * 0.03 }}
                  onClick={() => setSelectedHospital(hospital)}
                  className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-indigo-500/20 transition-all duration-300 cursor-pointer flex flex-col justify-between h-full group"
                >
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md border border-white/10 select-none">
                        {hospital.profilePicture ? (
                          <img src={hospital.profilePicture} alt={hospital.name} className="w-full h-full object-cover" />
                        ) : (
                          <Building2 className="w-6 h-6 text-indigo-400" />
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 select-none">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          hospital.type === 'government' ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                        }`}>
                          {hospital.type}
                        </span>
                        {hospital.averageRating > 0 && (
                          <div className="flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span className="text-[10px] font-bold text-amber-400">{hospital.averageRating}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <h3 className="text-base font-bold text-white mb-1 group-hover:text-indigo-400 transition-colors line-clamp-1">
                      {hospital.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-indigo-400 font-bold text-xs mb-4">
                      <MapPin className="w-3.5 h-3.5" />
                      {hospital.district || 'Unknown District'}
                    </div>
                    
                    <div className="space-y-2.5 text-xs text-slate-400 border-t border-white/5 pt-3 select-none">
                      {hospital.address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                          <span className="line-clamp-2 leading-relaxed">{hospital.address}</span>
                        </div>
                      )}
                      {hospital.contactPhone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                          <span>{hospital.contactPhone}</span>
                        </div>
                      )}
                      {hospital.emergencyHotline && (
                        <div className="flex items-center gap-2 text-rose-400 font-bold">
                          <PhoneCall className="w-4 h-4 text-rose-500 shrink-0 animate-pulse" />
                          <span>ER: {hospital.emergencyHotline}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-white/5 flex justify-end items-center select-none text-[10px] uppercase font-bold tracking-widest text-slate-500 group-hover:text-indigo-400 transition-colors gap-1">
                    Hospital Profile <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        
        {!loading && filteredHospitals.length === 0 && (
          <div className="text-center py-20 text-slate-500 select-none">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-sm font-semibold">No hospitals found matching "{search}"</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedHospital && (
          <HospitalProfileModal 
            hospital={selectedHospital} 
            onClose={() => setSelectedHospital(null)} 
          />
        )}
      </AnimatePresence>
    </PageTransition>
  );
};

export default HospitalDirectory;
