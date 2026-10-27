import { useTranslation } from '../../i18n/LanguageContext';
import React from 'react';
import { Download } from 'lucide-react';

const LabReportDownloadButton = ({ labTests = [] }) => {
  const { t } = useTranslation();

  // 1. Zero Tests: Hide button completely
  if (!labTests || labTests.length === 0) return null;

  const unavailableText = t("pdfUnavailable", "PDF export temporarily unavailable");

  // Under SECURITY_HOLD, every PDF download button is disabled
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={unavailableText}
      className="glass-btn inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300/60 text-xs font-bold opacity-60 cursor-not-allowed"
    >
      <Download className="w-3.5 h-3.5 text-purple-400/60" />
      {unavailableText}{labTests.length > 1 ? ` (${labTests.length})` : ''}
    </button>
  );
};

export default LabReportDownloadButton;
