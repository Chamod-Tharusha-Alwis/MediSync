import React, { createContext, useContext, useState, useMemo } from 'react';
import { en } from './translations/en';
import { si } from './translations/si';
import { ta } from './translations/ta';

const TRANSLATIONS = { en, si, ta };

const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'si', label: 'සිංහල', short: 'සිං' },
  { code: 'ta', label: 'தமிழ்', short: 'த' }
];

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    try {
      const saved = localStorage.getItem('medisync_language');
      return (saved && TRANSLATIONS[saved]) ? saved : 'en';
    } catch {
      return 'en';
    }
  });

  const setLanguage = (lang) => {
    if (TRANSLATIONS[lang]) {
      setLanguageState(lang);
      try {
        localStorage.setItem('medisync_language', lang);
      } catch (err) {
        console.warn('Failed to persist language in localStorage', err);
      }
    }
  };

  const t = useMemo(() => {
    return (path, fallback) => {
      if (!path) return '';
      const keys = path.split('.');
      
      // Attempt target language
      let curr = TRANSLATIONS[language];
      for (const k of keys) {
        if (curr && typeof curr === 'object' && k in curr) {
          curr = curr[k];
        } else {
          curr = undefined;
          break;
        }
      }
      if (curr !== undefined) return curr;

      // Fallback to English
      let fb = TRANSLATIONS.en;
      for (const k of keys) {
        if (fb && typeof fb === 'object' && k in fb) {
          fb = fb[k];
        } else {
          fb = undefined;
          break;
        }
      }
      if (fb !== undefined) return fb;

      return fallback !== undefined ? fallback : path;
    };
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t,
    languages: LANGUAGES
  }), [language, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    // Graceful fallback if rendered outside provider
    return {
      language: 'en',
      setLanguage: () => {},
      t: (path, fallback) => fallback || path,
      languages: LANGUAGES
    };
  }
  return context;
};

export default LanguageContext;
