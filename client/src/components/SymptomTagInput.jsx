import React, { useState, useRef, useEffect } from 'react';
import { FiX, FiLoader } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axiosInstance';

/**
 * SymptomTagInput
 * Fetches the canonical symptom list from GET /api/drugs/symptoms (which reads
 * symptom_map.json from the ML engine) so the doctor can only pick exact strings
 * the ML model understands, eliminating the data-sync gap.
 */
const SymptomTagInput = ({ selectedSymptoms, onChange }) => {
  const [inputValue, setInputValue] = useState('');
  const [allSymptoms, setAllSymptoms] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const inputRef = useRef(null);
  const wrapperRef = useRef(null);

  // Fetch the ML-canonical symptom list once on mount
  useEffect(() => {
    const fetchSymptoms = async () => {
      try {
        const res = await api.get('/drugs/symptoms');
        setAllSymptoms(res.data.data || []);
      } catch {
        // Fallback to a minimal static list so the UI still works offline
        setAllSymptoms([
          'Abdominal Pain', 'Back Pain', 'Breathlessness', 'Chills', 'Chest Pain',
          'Cough', 'Diarrhoea', 'Dizziness', 'Fatigue', 'Fever', 'Headache',
          'High Fever', 'Itching', 'Joint Pain', 'Loss of Appetite', 'Muscle Pain',
          'Nausea', 'Rash', 'Runny Nose', 'Skin Rash', 'Sneezing', 'Sweating',
          'Vomiting', 'Weakness', 'Weight Loss', 'Yellow Skin', 'Yellow Urine'
        ]);
      } finally {
        setIsLoadingList(false);
      }
    };
    fetchSymptoms();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    if (val.trim()) {
      const filtered = allSymptoms.filter(s =>
        s.toLowerCase().includes(val.toLowerCase()) &&
        !selectedSymptoms.includes(s)
      );
      setSuggestions(filtered.slice(0, 12));
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
    setFocusedIndex(-1);
  };

  const addSymptom = (symptom) => {
    if (selectedSymptoms.length >= 15) return;
    if (symptom.trim() && !selectedSymptoms.includes(symptom)) {
      onChange([...selectedSymptoms, symptom]);
    }
    setInputValue('');
    setIsOpen(false);
    setFocusedIndex(-1);
    inputRef.current?.focus();
  };

  const removeSymptom = (symptomToRemove) => {
    onChange(selectedSymptoms.filter(s => s !== symptomToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && focusedIndex >= 0) {
        addSymptom(suggestions[focusedIndex]);
      } else if (suggestions.length === 1) {
        // Auto-select single match on Enter
        addSymptom(suggestions[0]);
      }
    } else if (e.key === 'Backspace' && !inputValue && selectedSymptoms.length > 0) {
      removeSymptom(selectedSymptoms[selectedSymptoms.length - 1]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="w-full" ref={wrapperRef}>
      <div className="min-h-[50px] p-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary flex flex-wrap gap-2 transition-all">
        <AnimatePresence>
          {selectedSymptoms.map(symptom => (
            <motion.span
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0, width: 0, padding: 0, margin: 0 }}
              key={symptom}
              className="inline-flex items-center bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium"
            >
              {symptom}
              <button
                type="button"
                onClick={() => removeSymptom(symptom)}
                className="ml-1 hover:text-primaryDark focus:outline-none"
              >
                <FiX size={14} />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => inputValue.trim() && setIsOpen(true)}
          placeholder={
            isLoadingList
              ? 'Loading symptom list...'
              : selectedSymptoms.length === 0
              ? 'Type to search ML-verified symptoms...'
              : ''
          }
          className="flex-1 min-w-[180px] bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400 py-1"
          disabled={selectedSymptoms.length >= 15 || isLoadingList}
        />
        {isLoadingList && (
          <div className="flex items-center pr-2">
            <FiLoader className="animate-spin text-gray-400" size={14} />
          </div>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="relative z-50">
          <div className="absolute top-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto py-1">
            {suggestions.map((symptom, index) => (
              <div
                key={symptom}
                className={`px-4 py-2 cursor-pointer text-sm transition-colors ${
                  index === focusedIndex
                    ? 'bg-primary/5 text-primary font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => addSymptom(symptom)}
                onMouseEnter={() => setFocusedIndex(index)}
              >
                {symptom}
              </div>
            ))}
            <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
              ✦ These symptoms are indexed by the ML prediction engine
            </div>
          </div>
        </div>
      )}

      {isOpen && suggestions.length === 0 && inputValue.trim() && !isLoadingList && (
        <div className="relative z-50">
          <div className="absolute top-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg py-3 px-4">
            <p className="text-xs text-gray-500">
              No ML-indexed symptom matches "<span className="font-semibold">{inputValue}</span>".
              Check spelling or try a broader term.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SymptomTagInput;
