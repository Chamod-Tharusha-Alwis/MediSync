import React, { useState, useEffect, useRef } from 'react';
import axios from '../api/axiosInstance';
import { FiSearch, FiAlertTriangle, FiInfo, FiPlus } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

// Curated offline fallback catalog with name, genericName, brand, category, commonDosages
const FALLBACK_DRUGS = [
  { _id: 'd1', name: 'Paracetamol', genericName: 'Acetaminophen', brand: 'Panadol', category: 'analgesic', commonDosages: ['500mg', '1000mg'] },
  { _id: 'd2', name: 'Amoxicillin', genericName: 'Amoxicillin', brand: 'Amoxil', category: 'antibiotic', commonDosages: ['250mg', '500mg'] },
  { _id: 'd3', name: 'Ibuprofen', genericName: 'Ibuprofen', brand: 'Advil', category: 'analgesic', commonDosages: ['200mg', '400mg'] },
  { _id: 'd4', name: 'Omeprazole', genericName: 'Omeprazole', brand: 'Prilosec', category: 'antacid', commonDosages: ['20mg', '40mg'] },
  { _id: 'd5', name: 'Metformin', genericName: 'Metformin', brand: 'Glucophage', category: 'antidiabetic', commonDosages: ['500mg', '850mg'] },
  { _id: 'd6', name: 'Atorvastatin', genericName: 'Atorvastatin', brand: 'Lipitor', category: 'other', commonDosages: ['10mg', '20mg'] },
  { _id: 'd7', name: 'Amlodipine', genericName: 'Amlodipine', brand: 'Norvasc', category: 'antihypertensive', commonDosages: ['5mg', '10mg'] },
  { _id: 'd8', name: 'Loratadine', genericName: 'Loratadine', brand: 'Claritin', category: 'antihistamine', commonDosages: ['10mg'] },
  { _id: 'd9', name: 'Salbutamol', genericName: 'Albuterol', brand: 'Ventolin', category: 'respiratory', commonDosages: ['100mcg/dose'] },
  { _id: 'd10', name: 'Losartan', genericName: 'Losartan', brand: 'Cozaar', category: 'antihypertensive', commonDosages: ['50mg', '100mg'] },
  { _id: 'd11', name: 'Aspirin', genericName: 'Acetylsalicylic acid', brand: 'Disprin', category: 'analgesic', commonDosages: ['75mg', '300mg'] },
  { _id: 'd12', name: 'Ciprofloxacin', genericName: 'Ciprofloxacin', brand: 'Cipro', category: 'antibiotic', commonDosages: ['250mg', '500mg'] },
  { _id: 'd13', name: 'Azithromycin', genericName: 'Azithromycin', brand: 'Zithromax', category: 'antibiotic', commonDosages: ['250mg', '500mg'] },
  { _id: 'd14', name: 'Cetirizine', genericName: 'Cetirizine', brand: 'Zyrtec', category: 'antihistamine', commonDosages: ['10mg'] }
];

// Helper to filter and rank medication matches: prefix matches first, then substring matches
const rankMedicationMatches = (items, searchStr) => {
  if (!Array.isArray(items)) return [];
  const q = searchStr.toLowerCase();
  return items
    .filter(d => {
      const n = (d.name || '').toLowerCase();
      const g = (d.genericName || '').toLowerCase();
      const b = (d.brand || '').toLowerCase();
      return n.includes(q) || g.includes(q) || b.includes(q);
    })
    .sort((a, b) => {
      const aName = (a.name || '').toLowerCase();
      const aBrand = (a.brand || '').toLowerCase();
      const aGen = (a.genericName || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      const bBrand = (b.brand || '').toLowerCase();
      const bGen = (b.genericName || '').toLowerCase();

      const aPref = aName.startsWith(q) || aBrand.startsWith(q) || aGen.startsWith(q);
      const bPref = bName.startsWith(q) || bBrand.startsWith(q) || bGen.startsWith(q);

      if (aPref && !bPref) return -1;
      if (!aPref && bPref) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
};

const DrugSearchInput = ({ onSelect, currentPrescriptions = [], patientAllergies = [] }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isFlipped, setIsFlipped] = useState(false);
  const [interactionWarning, setInteractionWarning] = useState(null);
  const [verificationWarning, setVerificationWarning] = useState(null);

  const wrapperRef = useRef(null);
  const listRef = useRef(null);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Dynamic viewport flip-above detection when opening near bottom of viewport
  useEffect(() => {
    if (isOpen && wrapperRef.current && typeof window !== 'undefined') {
      const rect = wrapperRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setIsFlipped(spaceBelow < 280 && spaceAbove > spaceBelow);
    }
  }, [isOpen, results]);

  // Debounced search with race-condition guard
  useEffect(() => {
    let isCurrent = true;
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setResults([]);
      setIsLoading(false);
      setActiveIndex(-1);
      return () => {};
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await axios.get(`/drugs/search?q=${encodeURIComponent(trimmed)}`);
        if (!isCurrent) return;
        const incoming = res.data?.data || [];
        const sorted = rankMedicationMatches(incoming, trimmed);
        setResults(sorted);
        setIsOpen(true);
        setActiveIndex(-1);
      } catch (err) {
        if (!isCurrent) return;
        const filtered = rankMedicationMatches(FALLBACK_DRUGS, trimmed);
        setResults(filtered);
        setIsOpen(true);
        setActiveIndex(-1);
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }, 300);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  const checkInteractions = async (selectedDrug) => {
    setInteractionWarning(null);
    setVerificationWarning(null);

    // 1. Allergy check (client-side, instant)
    const allergies = patientAllergies || [];
    const nameLC = (selectedDrug.name || '').toLowerCase();
    const genericLC = (selectedDrug.genericName || '').toLowerCase();
    const brandLC = (selectedDrug.brand || '').toLowerCase();
    if (allergies.some(a => {
      const aLC = a.toLowerCase();
      return aLC === nameLC || (genericLC && genericLC.includes(aLC)) || (brandLC && brandLC.includes(aLC));
    })) {
      setInteractionWarning(`⚠ ALLERGY: Patient has a recorded allergy to ${selectedDrug.name}`);
      return;
    }

    // 2. Drug-drug interaction & ingredient resolution check
    const currentDrugNames = currentPrescriptions.map(p => p.name).filter(Boolean);
    const drugsToCheck = [selectedDrug.name, ...currentDrugNames];
    try {
      const res = await axios.post('/drugs/interactions', {
        drugs: drugsToCheck
      });
      const payload = res.data?.data;
      if (payload?.hasInteraction && Array.isArray(payload.warnings) && payload.warnings.length > 0) {
        const warningsText = payload.warnings
          .map(w => w.message || w.description)
          .filter(Boolean)
          .join(' | ');
        setInteractionWarning(`⚠️ MEDICATION SAFETY ALERT: ${warningsText}`);
      }
      if (payload?.verificationIncomplete && Array.isArray(payload.unresolvedIngredients) && payload.unresolvedIngredients.length > 0) {
        setVerificationWarning(
          payload.statusMessage ||
          `Automated interaction checking is incomplete. Unresolved ingredient(s): ${payload.unresolvedIngredients.join(', ')}.`
        );
      }
    } catch (error) {
      setVerificationWarning('Automated interaction checking could not be completed due to a service error.');
    }
  };

  const handleSelect = (drug) => {
    setQuery(drug.name);
    setIsOpen(false);
    setActiveIndex(-1);
    checkInteractions(drug);
    if (typeof onSelect === 'function') {
      onSelect(drug);
    }
  };

  const handleAddCustomMedication = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const exactMatch = results.find(d =>
      (d.name && d.name.toLowerCase() === trimmed.toLowerCase()) ||
      (d.brand && d.brand.toLowerCase() === trimmed.toLowerCase())
    );
    if (exactMatch) {
      handleSelect(exactMatch);
      return;
    }
    handleSelect({
      _id: `custom-${Date.now()}`,
      name: trimmed,
      genericName: trimmed,
      brand: '',
      category: 'Unlisted / Free-Text',
      commonDosages: []
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        if (results.length > 0 || query.trim().length >= 2) {
          setIsOpen(true);
          setActiveIndex(0);
        }
      } else if (results.length > 0) {
        setActiveIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen && results.length > 0) {
        setActiveIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed) return;

      if (isOpen && activeIndex >= 0 && activeIndex < results.length) {
        handleSelect(results[activeIndex]);
        return;
      }

      handleAddCustomMedication();
    }
  };

  return (
    <div className="relative z-30 w-full" ref={wrapperRef}>
      {/* Search Input Container with stable reserved dimensions */}
      <div className="relative min-h-[44px]">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FiSearch className="text-slate-500" />
        </div>
        <input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="medication-suggestions-list"
          aria-activedescendant={activeIndex >= 0 ? `med-suggestion-item-${activeIndex}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.trim().length >= 2) setIsOpen(true);
          }}
          placeholder="Search medication name, generic, or brand (press Enter to add)..."
          className="w-full pl-10 pr-10 py-2.5 h-11 glass-input text-sm text-slate-100 placeholder-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          autoComplete="off"
        />
        {isLoading && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none" data-testid="search-loading-spinner">
            <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Warnings slot with smooth zero-layout-shift transitions */}
      <div className="warnings-slot empty:hidden min-h-0" data-testid="drug-search-warnings" aria-live="polite">
        <AnimatePresence>
          {interactionWarning && (
            <motion.div
              key="interaction-alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="mt-2 p-3 bg-red-950/40 border border-red-500/30 rounded-xl flex items-start space-x-2 text-red-200 text-sm overflow-hidden"
            >
              <FiAlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400" />
              <p className="flex-1">{interactionWarning}</p>
            </motion.div>
          )}
          {verificationWarning && (
            <motion.div
              key="verification-alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="mt-2 p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl flex items-start space-x-2 text-amber-200 text-sm overflow-hidden"
            >
              <FiInfo className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" />
              <p className="flex-1">{verificationWarning}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && query.trim().length >= 2 && (
        <div
          ref={listRef}
          id="medication-suggestions-list"
          role="listbox"
          className={`absolute left-0 right-0 z-50 w-full bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar ${
            isFlipped ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {isLoading && (
            <div className="p-3 text-xs text-slate-400 flex items-center justify-center gap-2" role="status" data-testid="catalog-loading-indicator">
              <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              <span>Searching medication catalog...</span>
            </div>
          )}

          {!isLoading && results.length > 0 && results.map((drug, index) => {
            const isHighlighted = activeIndex === index;
            return (
              <div
                key={drug._id || `drug-${index}`}
                id={`med-suggestion-item-${index}`}
                role="option"
                aria-selected={isHighlighted}
                data-index={index}
                data-testid={`med-suggestion-${index}`}
                onClick={() => handleSelect(drug)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`p-3 border-b border-white/5 last:border-0 cursor-pointer transition-colors ${
                  isHighlighted ? 'bg-teal-500/20 text-white' : 'hover:bg-slate-800/60 text-slate-200'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-white text-sm">
                      {drug.name}
                      {drug.brand && drug.brand !== drug.name && (
                        <span className="ml-1.5 text-xs font-normal text-teal-300">
                          ({drug.brand})
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">{drug.genericName}</p>
                  </div>
                  {drug.category && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-teal-500/10 text-teal-300 rounded border border-teal-500/20">
                      {drug.category}
                    </span>
                  )}
                </div>
                {drug.commonDosages && drug.commonDosages.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {drug.commonDosages.map(dose => (
                      <span key={dose} className="text-xs bg-slate-950/60 text-slate-400 px-2 py-0.5 rounded border border-slate-800">
                        {dose}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {!isLoading && results.length === 0 && (
            <div
              className="p-3 text-xs text-slate-400 text-center border-b border-white/5"
              role="status"
              data-testid="no-catalog-match-message"
            >
              <span>No catalog medications matching "{query.trim()}".</span>
            </div>
          )}

          {query.trim().length > 0 && !results.some(d => (d.name || '').toLowerCase() === query.trim().toLowerCase()) && (
            <div
              role="button"
              tabIndex={0}
              data-testid="add-custom-medication-button"
              onClick={handleAddCustomMedication}
              className="p-3 hover:bg-amber-500/10 cursor-pointer transition-colors flex items-center justify-between text-amber-300 text-xs font-semibold"
            >
              <span className="flex items-center gap-2">
                <FiPlus className="w-4 h-4 text-amber-400" />
                Add "{query.trim()}" as unlisted / custom medication
              </span>
              <span className="text-[10px] uppercase px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 rounded">
                Unverified Ingredient
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DrugSearchInput;
