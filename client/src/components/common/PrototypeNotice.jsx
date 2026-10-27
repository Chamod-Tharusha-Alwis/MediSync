import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';

export const PROTOTYPE_NOTICES = {
  en: {
    text: 'Prototype: synthetic data only. Not for real patient use.'
  },
  si: {
    text: 'ප්‍රාථමික ආකෘතිය: කෘතිම දත්ත පමණි. සැබෑ රෝගී භාවිතය සඳහා නොවේ.'
  },
  ta: {
    text: 'முன்மாதிரி: செயற்கை தரவு மட்டுமே. உண்மையான நோயாளி பயன்பாட்டிற்கு அல்ல.'
  }
};

export default function PrototypeNotice() {
  const { language } = useTranslation();
  const currentNotice = PROTOTYPE_NOTICES[language] || PROTOTYPE_NOTICES.en;

  return (
    <aside
      role="status"
      data-testid="prototype-notice"
      aria-label="Prototype Notice"
      className="bg-amber-500/20 border-b border-amber-500/40 text-amber-200 px-4 py-2 text-center text-xs sm:text-sm font-medium tracking-wide z-50 sticky top-0 backdrop-blur-md shadow-sm"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span>{currentNotice.text}</span>
      </div>
    </aside>
  );
}
