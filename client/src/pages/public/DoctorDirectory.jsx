import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Star, Building2, MapPin, ArrowRight } from 'lucide-react';
import api from '../../api/axiosInstance';
import DoctorProfileModal from './DoctorProfileModal';
import PublicNavbar from '../../components/common/PublicNavbar';
import PageTransition from '../../components/common/PageTransition';

const DoctorDirectory = () => {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState(null);

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const res = await api.get('/public/doctors');
        setDoctors(res.data.data || []);
      } catch (err) {
        console.error('Failed to fetch doctors', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDoctors();
  }, []);

  const filteredDoctors = doctors.filter(d => 
    d.fullName?.toLowerCase().includes(search.toLowerCase()) || 
    d.specialization?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageTransition className="min-h-screen bg-[#0b1120] text-slate-200 pt-28 pb-12 px-6">
      <PublicNavbar />
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header & Search */}
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
            Verify Specialist Affiliations
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Search and verify certified medical practitioners, specialists, and hospital credentials across our medical network.
          </p>
          
          <div className="relative max-w-lg mx-auto pt-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4.5 h-4.5 select-none" />
            <input 
              type="text" 
              placeholder="Search doctor name or specialty..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-white/5 bg-slate-900/60 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-lg"
            />
          </div>
        </div>

        {/* Directory Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4 animate-pulse select-none">
                <div className="flex justify-between items-start">
                  <div className="w-14 h-14 rounded-full bg-slate-800" />
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
              {filteredDoctors.map((doc, idx) => (
                <motion.div
                  key={doc._id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, delay: idx * 0.03 }}
                  onClick={() => setSelectedDoctor(doc)}
                  className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-blue-500/20 transition-all duration-300 cursor-pointer flex flex-col justify-between h-full group"
                >
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-500 flex items-center justify-center text-white text-xl font-black shadow-md border border-white/10 select-none">
                        {doc.profilePicture ? (
                          <img src={doc.profilePicture} alt={doc.fullName} className="w-full h-full object-cover" />
                        ) : (
                          doc.fullName?.charAt(0).toUpperCase()
                        )}
                      </div>
                      {doc.averageRating > 0 && (
                        <div className="flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 select-none">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span className="text-xs font-bold text-amber-400">{doc.averageRating}</span>
                          <span className="text-[10px] text-amber-400/60">({doc.ratingCount})</span>
                        </div>
                      )}
                    </div>
                    
                    <h3 className="text-base font-bold text-white mb-1 group-hover:text-blue-400 transition-colors line-clamp-1">
                      {doc.fullName}
                    </h3>
                    <p className="text-blue-400 font-bold text-xs mb-4">{doc.specialization || 'General Practitioner'}</p>
                    
                    <div className="space-y-2.5 text-xs text-slate-400 border-t border-white/5 pt-3 select-none">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                        <span className="line-clamp-1">
                          {doc.hospitals?.length > 0 ? doc.hospitals[0].name : 'Private Practice'}
                          {doc.hospitals?.length > 1 && ` +${doc.hospitals.length - 1} affiliated`}
                        </span>
                      </div>
                      {doc.clinicAddress && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                          <span className="line-clamp-1">{doc.clinicAddress}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-white/5 flex justify-end items-center select-none text-[10px] uppercase font-bold tracking-widest text-slate-500 group-hover:text-blue-400 transition-colors gap-1">
                    View Credentials <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        
        {!loading && filteredDoctors.length === 0 && (
          <div className="text-center py-20 text-slate-500 select-none">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-sm font-semibold">No doctors found matching "{search}"</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedDoctor && (
          <DoctorProfileModal 
            doctor={selectedDoctor} 
            onClose={() => setSelectedDoctor(null)} 
          />
        )}
      </AnimatePresence>
    </PageTransition>
  );
};

export default DoctorDirectory;
