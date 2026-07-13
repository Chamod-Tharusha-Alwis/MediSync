import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MapPin, Phone, ShieldCheck, Pill, Star, ArrowRight } from 'lucide-react';
import api from '../../api/axiosInstance';
import PublicNavbar from '../../components/common/PublicNavbar';
import PharmacyProfileModal from './PharmacyProfileModal';
import PageTransition from '../../components/common/PageTransition';

const PharmacyDirectory = () => {
  const [pharmacies, setPharmacies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPharmacy, setSelectedPharmacy] = useState(null);

  useEffect(() => {
    const fetchPharmacies = async () => {
      try {
        const res = await api.get('/public/pharmacies');
        setPharmacies(res.data.data || []);
      } catch (err) {
        console.error('Failed to fetch pharmacies', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPharmacies();
  }, []);

  const filteredPharmacies = pharmacies.filter(p => 
    p.name?.toLowerCase().includes(search.toLowerCase()) || 
    p.district?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageTransition className="min-h-screen bg-[#0b1120] text-slate-200 pt-28 pb-12 px-6">
      <PublicNavbar />
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header & Search */}
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
            Dispensing Locations
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Locate pharmacies and distribution centers synchronized with our central prescription locking networks.
          </p>
          
          <div className="relative max-w-lg mx-auto pt-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4.5 h-4.5 select-none" />
            <input 
              type="text" 
              placeholder="Search by pharmacy name or district..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-white/5 bg-slate-900/60 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-lg"
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
              {filteredPharmacies.map((pharm, idx) => (
                <motion.div
                  key={pharm._id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, delay: idx * 0.03 }}
                  onClick={() => setSelectedPharmacy(pharm)}
                  className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-emerald-500/20 transition-all duration-300 cursor-pointer flex flex-col justify-between h-full group"
                >
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-md border border-white/10 select-none">
                        {pharm.profilePicture ? (
                          <img src={pharm.profilePicture} alt={pharm.name} className="w-full h-full object-cover" />
                        ) : (
                          <Pill className="w-6 h-6 text-emerald-400" />
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 select-none">
                        {pharm.isActive && (
                          <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 text-[9px] font-bold">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            E-Prescriptions
                          </div>
                        )}
                        {pharm.averageRating > 0 && (
                          <div className="flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span className="text-[10px] font-bold text-amber-400">{pharm.averageRating}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <h3 className="text-base font-bold text-white mb-1 group-hover:text-emerald-400 transition-colors line-clamp-1">
                      {pharm.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs mb-4">
                      <MapPin className="w-3.5 h-3.5" />
                      {pharm.district || 'Unknown District'}
                    </div>
                    
                    <div className="space-y-2.5 text-xs text-slate-400 border-t border-white/5 pt-3 select-none">
                      {pharm.address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                          <span className="line-clamp-2 leading-relaxed">{pharm.address}</span>
                        </div>
                      )}
                      {pharm.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                          <span>{pharm.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-white/5 flex justify-end items-center select-none text-[10px] uppercase font-bold tracking-widest text-slate-500 group-hover:text-emerald-400 transition-colors gap-1">
                    Terminal Details <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        
        {!loading && filteredPharmacies.length === 0 && (
          <div className="text-center py-20 text-slate-500 select-none">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-sm font-semibold">No pharmacies found matching "{search}"</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedPharmacy && (
          <PharmacyProfileModal 
            pharmacy={selectedPharmacy} 
            onClose={() => setSelectedPharmacy(null)} 
          />
        )}
      </AnimatePresence>
    </PageTransition>
  );
};

export default PharmacyDirectory;
