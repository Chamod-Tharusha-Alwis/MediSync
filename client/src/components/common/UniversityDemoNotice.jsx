import React, { useEffect, useRef } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';

const notices = {
  en: {
    title: 'Educational demonstration — synthetic data only',
    body: 'Do not enter real personal or medical information. This university project is not for diagnosis, treatment or emergency care.',
  },
  si: {
    title: 'අධ්‍යාපනික නිරූපණයක් — කෘත්‍රිම දත්ත පමණි',
    body: 'සැබෑ පුද්ගලික හෝ වෛද්‍ය තොරතුරු ඇතුළත් නොකරන්න. මෙම විශ්වවිද්‍යාල ව්‍යාපෘතිය රෝග විනිශ්චය, ප්‍රතිකාර හෝ හදිසි සත්කාර සඳහා නොවේ.',
  },
  ta: {
    title: 'கல்வி விளக்கம் — செயற்கைத் தரவு மட்டுமே',
    body: 'உண்மையான தனிப்பட்ட அல்லது மருத்துவத் தகவல்களை உள்ளிட வேண்டாம். இந்தப் பல்கலைக்கழகத் திட்டம் நோயறிதல், சிகிச்சை அல்லது அவசர சிகிச்சைக்கானது அல்ல.',
  },
};

export default function UniversityDemoNotice() {
  const { language } = useTranslation();
  const enabled = process.env.REACT_APP_MEDISYNC_UNIVERSITY_DEMO === 'true';
  const noticeRef = useRef(null);
  useEffect(() => {
    if (!enabled || !noticeRef.current) return undefined;
    const root = document.documentElement, property = '--medisync-demo-notice-height';
    const previous = root.style.getPropertyValue(property);
    const previousScrollPadding = root.style.scrollPaddingBottom;
    const measure = () => {
      const height = noticeRef.current?.getBoundingClientRect().height;
      if (Number.isFinite(height) && height > 0) {
        root.style.setProperty(property, Math.ceil(height) + 'px');
        root.style.scrollPaddingBottom = Math.ceil(height) + 'px';
      }
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(noticeRef.current);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect(); window.removeEventListener('resize', measure);
      if (previous) root.style.setProperty(property, previous); else root.style.removeProperty(property);
      root.style.scrollPaddingBottom = previousScrollPadding;
    };
  }, [enabled, language]);
  if (!enabled) return null;
  const notice = notices[language] || notices.en;
  // Presentation only: server-side synthetic-data restrictions remain mandatory.
  return (
    <aside ref={noticeRef} role="note" aria-label={notice.title} lang={Object.hasOwn(notices, language) ? language : 'en'}
      className="fixed bottom-0 inset-x-0 z-[60] border-t border-amber-400/30 bg-slate-950/95 px-4 py-3 text-amber-100 shadow-lg">
      <div className="mx-auto max-w-6xl text-xs leading-relaxed">
        <strong className="block font-semibold">{notice.title}</strong>
        <p className="mt-1 text-amber-100/90">{notice.body}</p>
      </div>
    </aside>
  );
}
