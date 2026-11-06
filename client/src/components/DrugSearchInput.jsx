import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from '../api/axiosInstance';
import { FiSearch, FiAlertTriangle, FiInfo, FiPlus } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { medicationSafetyResponse } from '../utils/medicationSafetyResponse';

// Curated offline fallback catalog with name, genericName, brand, category, commonDosages, and trilingual labels
const FALLBACK_DRUGS = [
  { _id: 'd1', name: 'Paracetamol', genericName: 'Acetaminophen', brand: 'Panadol', category: 'analgesic', commonDosages: ['500mg', '1000mg'], si: 'පැරසිටමෝල්', ta: 'பராசிட்டமால்' },
  { _id: 'd2', name: 'Amoxicillin', genericName: 'Amoxicillin', brand: 'Amoxil', category: 'antibiotic', commonDosages: ['250mg', '500mg'], si: 'ඇමොක්සිසිලින්', ta: 'அமோக்சிசிலின்' },
  { _id: 'd3', name: 'Ibuprofen', genericName: 'Ibuprofen', brand: 'Advil', category: 'analgesic', commonDosages: ['200mg', '400mg'], si: 'අයිබියුප්රොෆෙන්', ta: 'ஐபுப்ரோஃபென்' },
  { _id: 'd4', name: 'Omeprazole', genericName: 'Omeprazole', brand: 'Prilosec', category: 'antacid', commonDosages: ['20mg', '40mg'], si: 'ඔමිප්‍රසෝල්', ta: 'ஒமேபிரசோல்' },
  { _id: 'd5', name: 'Metformin', genericName: 'Metformin', brand: 'Glucophage', category: 'antidiabetic', commonDosages: ['500mg', '850mg'], si: 'මෙට්ෆෝමින්', ta: 'மெட்பார்மின்' },
  { _id: 'd6', name: 'Atorvastatin', genericName: 'Atorvastatin', brand: 'Lipitor', category: 'other', commonDosages: ['10mg', '20mg'], si: 'ඇටෝර්වාස්ටැටින්', ta: 'அடோர்வாஸ்டேட்டின்' },
  { _id: 'd7', name: 'Amlodipine', genericName: 'Amlodipine', brand: 'Norvasc', category: 'antihypertensive', commonDosages: ['5mg', '10mg'], si: 'ඇම්ලොඩිපින්', ta: 'அம்லோடிபைன்' },
  { _id: 'd8', name: 'Loratadine', genericName: 'Loratadine', brand: 'Claritin', category: 'antihistamine', commonDosages: ['10mg'] },
  { _id: 'd9', name: 'Salbutamol', genericName: 'Albuterol', brand: 'Ventolin', category: 'respiratory', commonDosages: ['100mcg/dose'], si: 'සැල්බියුටමෝල්', ta: 'சல்பூட்டமால்' },
  { _id: 'd10', name: 'Losartan', genericName: 'Losartan', brand: 'Cozaar', category: 'antihypertensive', commonDosages: ['50mg', '100mg'], si: 'ලොසාර්ටන්', ta: 'லோசார்டன்' },
  { _id: 'd11', name: 'Aspirin', genericName: 'Acetylsalicylic acid', brand: 'Disprin', category: 'analgesic', commonDosages: ['75mg', '300mg'], si: 'ඇස්පිරින්', ta: 'ஆஸ்பிரින්' },
  { _id: 'd12', name: 'Ciprofloxacin', genericName: 'Ciprofloxacin', brand: 'Cipro', category: 'antibiotic', commonDosages: ['250mg', '500mg'], si: 'සිප්රොෆ්ලොක්සැසින්', ta: 'சிப்ரோப்ளோக்சசின்' },
  { _id: 'd13', name: 'Azithromycin', genericName: 'Azithromycin', brand: 'Zithromax', category: 'antibiotic', commonDosages: ['250mg', '500mg'], si: 'ඇසිට්රොමයිසින්', ta: 'அசித்ரோமைசின்' },
  { _id: 'd14', name: 'Cetirizine', genericName: 'Cetirizine', brand: 'Zyrtec', category: 'antihistamine', commonDosages: ['10mg'], si: 'සෙටිරිසින්', ta: 'செடிரிசைன்' }
];

// Trilingual / phonetic transliteration dictionary for essential medications
const TRANSLITERATION_MAP = {
  'පැරසිටමෝල්': 'paracetamol',
  'පැනඩෝල්': 'panadol',
  'ඇමොක්සිසිලින්': 'amoxicillin',
  'අයිබියුප්රොෆෙන්': 'ibuprofen',
  'ඔමිප්‍රසෝල්': 'omeprazole',
  'මෙට්ෆෝමින්': 'metformin',
  'සෙටිරිසින්': 'cetirizine',
  'සැල්බියුටමෝල්': 'salbutamol',
  'ඇස්පිරින්': 'aspirin',
  'ලොසාර්ටන්': 'losartan',
  'ඇටෝර්වාස්ටැටින්': 'atorvastatin',
  'ඇම්ලොඩිපින්': 'amlodipine',
  'සිප්රොෆ්ලොක්සැසින්': 'ciprofloxacin',
  'ඇසිට්රොමයිසින්': 'azithromycin',
  'பராசிட்டமால்': 'paracetamol',
  'பனடோல்': 'panadol',
  'அமோக்சிசிலின்': 'amoxicillin',
  'ஐபுப்ரோஃபென்': 'ibuprofen',
  'ஒமேபிரசோல்': 'omeprazole',
  'மெட்பார்மின்': 'metformin',
  'செடிரிசைன்': 'cetirizine',
  'சல்பூட்டமால்': 'salbutamol',
  'ஆஸ்பிரின்': 'aspirin',
  'லோசார்டன்': 'losartan',
  'அடோர்வாஸ்டேட்டின்': 'atorvastatin',
  'அம்லோடிபைன்': 'amlodipine',
  'சிப்ரோப்ளோக்சசின்': 'ciprofloxacin',
  'அசித்ரோமைசின்': 'azithromycin'
};

const resolveTransliteration = (str) => {
  if (!str) return '';
  const s = str.trim().toLowerCase();
  for (const [nonLatin, latin] of Object.entries(TRANSLITERATION_MAP)) {
    if (s.includes(nonLatin) || nonLatin.includes(s)) {
      return latin;
    }
  }
  return s;
};

// Helper to filter and rank medication matches: prefix matches first, then substring matches
const NON_PRESCRIBABLE_NAME_RE =
  /\b(soap|shampoo|face\s*wash|facewash|gel\s*wash|creamy\s*wash|body\s*wash|cleansing\s*gel|cleanser|bathing\s*bar|syndet\s*bar|acne\s*bar|face\s*pack|pad\s*wipes|scar\s*serum)\b/i;
const NON_PRESCRIBABLE_GENERIC_RE = /^generic\s+name\s+skin\s+care$/i;

const isPrescribableDrug = drug => {
  if (!drug) return false;
  const name = String(drug.name || '');
  const brand = String(drug.brand || '');
  const generic = String(drug.genericName || '').trim();
  if (NON_PRESCRIBABLE_NAME_RE.test(name) || NON_PRESCRIBABLE_NAME_RE.test(brand)) return false;
  if (NON_PRESCRIBABLE_GENERIC_RE.test(generic)) return false;
  return true;
};

const rankMedicationMatches = (items, searchStr) => {
  if (!Array.isArray(items)) return [];
  const rawQ = searchStr.trim().toLowerCase();
  const latinQ = resolveTransliteration(rawQ);
  return items
    .filter(isPrescribableDrug)
    .filter(d => {
      const n = (d.name || '').toLowerCase();
      const g = (d.genericName || '').toLowerCase();
      const b = (d.brand || '').toLowerCase();
      const si = (d.si || '').toLowerCase();
      const ta = (d.ta || '').toLowerCase();
      return (
        n.includes(rawQ) || g.includes(rawQ) || b.includes(rawQ) ||
        si.includes(rawQ) || ta.includes(rawQ) ||
        (latinQ && (n.includes(latinQ) || g.includes(latinQ) || b.includes(latinQ)))
      );
    })
    .sort((a, b) => {
      const aName = (a.name || '').toLowerCase();
      const aBrand = (a.brand || '').toLowerCase();
      const aGen = (a.genericName || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      const bBrand = (b.brand || '').toLowerCase();
      const bGen = (b.genericName || '').toLowerCase();

      const aPref = aName.startsWith(rawQ) || aBrand.startsWith(rawQ) || aGen.startsWith(rawQ) ||
                    (latinQ && (aName.startsWith(latinQ) || aBrand.startsWith(latinQ) || aGen.startsWith(latinQ)));
      const bPref = bName.startsWith(rawQ) || bBrand.startsWith(rawQ) || bGen.startsWith(rawQ) ||
                    (latinQ && (bName.startsWith(latinQ) || bBrand.startsWith(latinQ) || bGen.startsWith(latinQ)));

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
  const interactionRequestRef = useRef(0);
  useEffect(() => () => { interactionRequestRef.current += 1; }, []);

  const [dropdownCoords, setDropdownCoords] = useState({ top: 0, bottom: 0, left: 0, width: 0, isFlipped: false });

  const updateCoords = useCallback(() => {
    if (wrapperRef.current && typeof window !== 'undefined') {
      const rect = wrapperRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const flipped = spaceBelow < 280 && spaceAbove > spaceBelow;
      setIsFlipped(flipped);
      setDropdownCoords({
        top: rect.bottom + 6,
        bottom: window.innerHeight - rect.top + 6,
        left: rect.left,
        width: rect.width,
        isFlipped: flipped
      });
    }
  }, []);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target) &&
        (!listRef.current || !listRef.current.contains(event.target))
      ) {
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

  // Reposition dropdown on open, result change, scroll, and resize
  useEffect(() => {
    if (!isOpen) return;
    updateCoords();
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [isOpen, results, updateCoords]);

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
        let pool = incoming;
        if (!incoming.length) {
          pool = FALLBACK_DRUGS;
        } else {
          const names = new Set(incoming.map(d => (d.name || '').toLowerCase()));
          const extra = FALLBACK_DRUGS.filter(d => !names.has((d.name || '').toLowerCase()));
          pool = [...incoming, ...extra];
        }
        const sorted = rankMedicationMatches(pool, trimmed);
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
    const request = ++interactionRequestRef.current;
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
      if (request !== interactionRequestRef.current) return;
      const payload = medicationSafetyResponse(res.data?.data);
      if (payload.hasInteraction) {
        const warningsText = payload.warnings.join(' | ');
        setInteractionWarning(`⚠️ MEDICATION SAFETY ALERT: ${warningsText}`);
      }
      if (payload.verificationIncomplete) {
        setVerificationWarning(
          payload.statusMessage ||
          (payload.unresolvedIngredients.length
            ? `Automated interaction checking is incomplete. Unresolved ingredient(s): ${payload.unresolvedIngredients.join(', ')}.`
            : 'Automated interaction checking is incomplete.')
        );
      }
    } catch (error) {
      if (request !== interactionRequestRef.current) return;
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
          aria-expanded={Boolean(isOpen && query.trim().length >= 2)}
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
      {isOpen && query.trim().length >= 2 && (() => {
        const dropdownElement = (
          <div
            ref={listRef}
            id="medication-suggestions-list"
            role="listbox"
            style={{
              position: 'fixed',
              top: dropdownCoords.isFlipped ? undefined : `${dropdownCoords.top}px`,
              bottom: dropdownCoords.isFlipped ? `${dropdownCoords.bottom}px` : undefined,
              left: `${dropdownCoords.left}px`,
              width: dropdownCoords.width ? `${dropdownCoords.width}px` : undefined,
              zIndex: 9999
            }}
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
                      <span className="text-[11px] uppercase font-bold tracking-wider px-2 py-1 bg-teal-500/10 text-teal-300 rounded border border-teal-500/20">
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
                <span className="text-[11px] uppercase px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 rounded">
                  Unverified Ingredient
                </span>
              </div>
            )}
          </div>
        );

        return typeof document !== 'undefined' && document.body
          ? createPortal(dropdownElement, document.body)
          : dropdownElement;
      })()}
    </div>
  );
};

export default DrugSearchInput;
