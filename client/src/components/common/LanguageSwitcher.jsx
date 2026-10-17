import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { Globe } from 'lucide-react';

export const LanguageSwitcher = ({ variant = 'light', compact = false }) => {
  const { language, setLanguage, languages } = useTranslation();

  const isDark = variant === 'dark';

  return (
    <div
      role="group"
      aria-label="Language selection"
      className={`inline-flex items-center gap-1 p-1 rounded-xl transition-all duration-200 ${
        isDark
          ? 'bg-slate-900/60 border border-white/10 backdrop-blur-md'
          : 'bg-slate-100 border border-slate-200/80 shadow-sm'
      }`}
    >
      {!compact && (
        <Globe
          className={`w-3.5 h-3.5 ml-1 mr-0.5 ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}
          aria-hidden="true"
        />
      )}
      {languages.map((lang) => {
        const isActive = language === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => setLanguage(lang.code)}
            title={lang.label}
            aria-label={lang.label}
            aria-pressed={isActive}
            className={`px-2 py-1 text-xs font-bold rounded-lg transition-all duration-150 ${
              isActive
                ? isDark
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-blue-600 shadow-sm font-black'
                : isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            {lang.short}
          </button>
        );
      })}
    </div>
  );
};

export default LanguageSwitcher;
