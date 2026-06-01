import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MapPin, Phone, ShieldCheck, Pill } from 'lucide-react';
import api from '../../api/axiosInstance';

const PharmacyDirectory = () => {
  const [pharmacies, setPharmacies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchPharmacies = async () => {
      try {
        const res = await api.get('/public/pharmacies');
        setPharmacies(res.data.data);
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
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-6">
        
        {/* Header & Search */}
        <div className="text-center mb-12">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-4"
          >
            Registered Pharmacies
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-slate-500 mb-8 max-w-2xl mx-auto"
          >
            Discover secure dispensing locations authorized by MediSync.
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
              placeholder="Search by pharmacy name or district..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-full border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-lg transition-shadow bg-white"
            />
          </motion.div>
        </div>

        {/* Directory Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {filteredPharmacies.map((pharm, idx) => (
                <motion.div
                  key={pharm._id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                  whileHover={{ scale: 1.03, y: -5 }}
                  className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-xl transition-shadow flex flex-col relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full blur-3xl -z-10 translate-x-10 -translate-y-10" />
                  
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-md">
                      <Pill className="w-7 h-7" />
                    </div>
                    {pharm.isActive && (
                      <div className="flex items-center gap-1 bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full border border-emerald-200/50 text-xs font-bold shadow-sm">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        E-Prescription Ready
                      </div>
                    )}
                  </div>
                  
                  <h3 className="text-xl font-bold text-slate-800 mb-1 line-clamp-1">{pharm.name}</h3>
                  <div className="flex items-center gap-1.5 text-amber-600 font-medium text-sm mb-4">
                    <MapPin className="w-4 h-4" />
                    {pharm.district || 'Unknown District'}
                  </div>
                  
                  <div className="space-y-3 text-sm text-slate-600 flex-1">
                    {pharm.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 opacity-50 mt-0.5" />
                        <span className="line-clamp-2 leading-tight">{pharm.address}</span>
                      </div>
                    )}
                    {pharm.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 opacity-50" />
                        <span>{pharm.phone}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        
        {!loading && filteredPharmacies.length === 0 && (
          <div className="text-center py-20 text-slate-500">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg">No pharmacies found matching "{search}"</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PharmacyDirectory;
