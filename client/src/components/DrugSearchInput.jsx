import React, { useState, useEffect, useRef } from 'react';
import axios from '../api/axiosInstance';
import { FiSearch, FiAlertTriangle } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const DrugSearchInput = ({ onSelect, currentPrescriptions = [], patientAllergies = [] }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [interactionWarning, setInteractionWarning] = useState(null);
  
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const searchDrugs = async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setIsLoading(true);
      try {
        const res = await axios.get(`/drugs/search?q=${query}`);
        setResults(res.data.data);
        setIsOpen(true);
      } catch (err) {
        // Fallback to standard list if drug search fails
        const q = query.toLowerCase();
        const fallbackDrugs = [
          { _id: 'd1', name: 'Paracetamol', genericName: 'Acetaminophen', category: 'Analgesic', commonDosages: ['500mg', '1000mg'] },
          { _id: 'd2', name: 'Amoxicillin', genericName: 'Amoxicillin', category: 'Antibiotic', commonDosages: ['250mg', '500mg'] },
          { _id: 'd3', name: 'Ibuprofen', genericName: 'Ibuprofen', category: 'NSAID', commonDosages: ['200mg', '400mg'] },
          { _id: 'd4', name: 'Omeprazole', genericName: 'Omeprazole', category: 'PPI', commonDosages: ['20mg', '40mg'] },
          { _id: 'd5', name: 'Metformin', genericName: 'Metformin', category: 'Antidiabetic', commonDosages: ['500mg', '850mg'] },
          { _id: 'd6', name: 'Atorvastatin', genericName: 'Atorvastatin', category: 'Statin', commonDosages: ['10mg', '20mg'] },
          { _id: 'd7', name: 'Amlodipine', genericName: 'Amlodipine', category: 'Calcium Channel Blocker', commonDosages: ['5mg', '10mg'] },
          { _id: 'd8', name: 'Loratadine', genericName: 'Loratadine', category: 'Antihistamine', commonDosages: ['10mg'] },
          { _id: 'd9', name: 'Salbutamol', genericName: 'Albuterol', category: 'Bronchodilator', commonDosages: ['100mcg/dose'] },
          { _id: 'd10', name: 'Losartan', genericName: 'Losartan', category: 'ARB', commonDosages: ['50mg', '100mg'] }
        ];
        
        const filtered = fallbackDrugs.filter(d => 
          d.name.toLowerCase().includes(q) || d.genericName.toLowerCase().includes(q)
        );
        setResults(filtered);
        setIsOpen(true);
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchDrugs, 300);
    return () => clearTimeout(debounceTimer);
  }, [query]);

  const checkInteractions = async (selectedDrug) => {
    setInteractionWarning(null);

    // 1. Allergy check (client-side, instant)
    const allergies = patientAllergies || [];
    const nameLC = (selectedDrug.name || '').toLowerCase();
    const genericLC = (selectedDrug.genericName || '').toLowerCase();
    if (allergies.some(a => a.toLowerCase() === nameLC || a.toLowerCase() === genericLC)) {
      setInteractionWarning(`⚠ ALLERGY: Patient has a recorded allergy to ${selectedDrug.name}`);
      return;
    }

    // 2. Drug-drug interaction check (backend resolves brand → generic)
    const currentDrugNames = currentPrescriptions.map(p => p.name).filter(Boolean);
    if (currentDrugNames.length > 0) {
      try {
        const res = await axios.post('/drugs/interactions', {
          drugs: [selectedDrug.name, ...currentDrugNames]
        });
        if (res.data.data?.hasInteraction) {
          const warnings = res.data.data.warnings
            .map(w => `${w.drug1} + ${w.drug2} [${w.severity?.toUpperCase()}]: ${w.message}`)
            .join(' | ');
          setInteractionWarning(warnings);
        }
      } catch {
        // Silently ignore network failures
      }
    }
  };

  const handleSelect = (drug) => {
    setQuery(drug.name);
    setIsOpen(false);
    checkInteractions(drug);
    onSelect(drug);
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FiSearch className="text-gray-400" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setInteractionWarning(null); // Clear warning on typing
          }}
          onFocus={() => query.trim() && setResults(results) && setIsOpen(true)}
          placeholder="Search medication name or generic..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors text-sm"
        />
        {isLoading && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {interactionWarning && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2 text-red-700 text-sm"
          >
            <FiAlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>{interactionWarning}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {results.map((drug) => (
            <div
              key={drug._id}
              onClick={() => handleSelect(drug)}
              className="p-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{drug.name}</p>
                  <p className="text-xs text-gray-500">{drug.genericName}</p>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-blue-50 text-blue-600 rounded">
                  {drug.category}
                </span>
              </div>
              {drug.commonDosages && drug.commonDosages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {drug.commonDosages.map(dose => (
                    <span key={dose} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {dose}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DrugSearchInput;
