import React, { useState, useRef, useEffect, useId } from 'react';
import { FiSearch, FiChevronDown, FiCheck } from 'react-icons/fi';
import api from '../api/axiosInstance';

const DiseaseCombobox = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [options, setOptions] = useState(['All Diseases']);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const listId = useId();
  const [searchError, setSearchError] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchDiseases = async (searchQuery, signal) => {
    setSearchError(false);
    if (!searchQuery) {
      setOptions(['All Diseases']);
      return;
    }
    try {
      const res = await api.get('/public/diseases/search', { params: { q: searchQuery }, signal });
      if (!Array.isArray(res.data.data)) throw new Error('Invalid disease search response');
      if (!signal.aborted) setOptions(['All Diseases', ...res.data.data]);
    } catch (err) {
      if (!signal.aborted) { setOptions(['All Diseases']); setSearchError(true); }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchDiseases(query, controller.signal);
    }, 300);
    return () => { clearTimeout(debounceRef.current); controller.abort(); };
  }, [query]);

  const displayValue = value === 'all' ? 'All Diseases' : value;

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => (prev < options.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < options.length) {
        const selected = options[focusedIndex];
        const val = selected === 'All Diseases' ? 'all' : selected;
        onChange(val);
        setIsOpen(false);
        setQuery('');
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  return (
    <div ref={wrapperRef} className="relative w-48 sm:w-64">
      <button type="button" aria-label="Disease filter" aria-expanded={isOpen} aria-haspopup="listbox" aria-controls={listId}
        className="flex items-center justify-between bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 cursor-pointer hover:bg-slate-700/50 transition-colors focus:ring-2 focus:ring-teal-500 focus:outline-none"
        onClick={() => setIsOpen(!isOpen)}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <span className="truncate">{displayValue || 'Select Disease'}</span>
        <FiChevronDown className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl ring-1 ring-black/50 overflow-hidden">
          <div className="p-2 border-b border-slate-700">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="Search diseases" role="combobox" aria-expanded={isOpen} aria-controls={listId} aria-activedescendant={focusedIndex >= 0 ? `${listId}-${focusedIndex}` : undefined}
                ref={inputRef}
                type="text"
                placeholder="Search..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setFocusedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-md pl-9 pr-3 py-1.5 text-sm focus:ring-1 focus:ring-teal-500 outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          
          {searchError && <p role="alert" className="px-3 py-2 text-xs text-rose-300">Disease search unavailable. Please try again.</p>}
          <div id={listId} role="listbox" className="max-h-60 overflow-y-auto custom-scrollbar p-1">
            {options.length > 0 ? (
              options.map((disease, index) => {
                const isSelected = disease === displayValue;
                const isFocused = index === focusedIndex;
                const val = disease === 'All Diseases' ? 'all' : disease;
                
                return (
                  <div
                    id={`${listId}-${index}`} role="option" aria-selected={isSelected}
                    key={disease}
                    className={`flex items-center justify-between px-3 py-2 text-sm rounded-md cursor-pointer transition-colors ${
                      isFocused ? 'bg-slate-700' : ''
                    } ${
                      isSelected ? 'bg-teal-500/20 text-teal-400' : 'text-slate-300 hover:bg-slate-700'
                    }`}
                    onClick={() => {
                      onChange(val);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    onMouseEnter={() => setFocusedIndex(index)}
                  >
                    {disease}
                    {isSelected && <FiCheck />}
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-4 text-sm text-center text-slate-500">
                No diseases found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DiseaseCombobox;
