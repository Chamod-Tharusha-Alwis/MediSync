import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import LanguageSwitcher from '../../components/common/LanguageSwitcher';
import { useTranslation } from '../../i18n/LanguageContext';

export default function NotFound() {
  const { t } = useTranslation();
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/90 p-6 sm:p-10 text-center space-y-6">
        <LanguageSwitcher variant="dark" />
        <p className="text-5xl font-bold text-teal-300" aria-hidden="true">404</p>
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold text-white focus:outline-none">
          {t('notFound.title')}
        </h1>
        <p className="text-slate-300">{t('notFound.description')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/" className="min-h-[44px] inline-flex items-center rounded-xl bg-teal-300 px-4 py-3 font-semibold text-slate-950 hover:bg-teal-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300">
            {t('notFound.home')}
          </Link>
          <Link to="/select-role" className="min-h-[44px] inline-flex items-center rounded-xl border border-slate-500 px-4 py-3 font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300">
            {t('notFound.signIn')}
          </Link>
        </div>
      </div>
    </main>
  );
}
