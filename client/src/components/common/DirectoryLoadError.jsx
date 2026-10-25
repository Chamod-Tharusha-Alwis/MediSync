import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';

export default function DirectoryLoadError({ retry }) {
  const { t } = useTranslation();
  return <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 text-center text-amber-100">
    <p>{t('serviceStatus.directoryUnavailable', 'Directory unavailable. Please try again.')}</p>
    <button type="button" onClick={retry} className="mt-3 min-h-[44px] rounded-lg border border-amber-500/40 px-4 py-2 font-semibold focus-visible:outline focus-visible:outline-2">
      {t('serviceStatus.retry', 'Try again')}
    </button>
  </div>;
}
