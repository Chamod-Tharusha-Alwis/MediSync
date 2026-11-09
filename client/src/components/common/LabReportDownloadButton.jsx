import { useTranslation } from '../../i18n/LanguageContext';
import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { isPdfExportClientEnabled, downloadClinicalPdf } from '../../utils/pdfDownload';

const LabReportDownloadButton = ({ labTests = [], onSelectTest, enabled }) => {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);

  // 1. Zero Tests: Hide button completely
  if (!labTests || labTests.length === 0) return null;

  const unavailableText = t("pdfUnavailable", "PDF export temporarily unavailable");
  const isGateEnabled = isPdfExportClientEnabled(enabled);

  // Under SECURITY_HOLD (default OFF), every PDF download button is disabled with clear hold label
  if (!isGateEnabled) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={unavailableText}
        className="glass-button inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300/60 text-xs font-bold opacity-60 cursor-not-allowed"
      >
        <Download className="w-3.5 h-3.5 text-purple-400/60" />
        {unavailableText}{labTests.length > 1 ? ` (${labTests.length})` : ''}
      </button>
    );
  }

  const handleClick = async (e) => {
    e.stopPropagation();
    if (downloading) return;
    if (labTests.length > 1 && typeof onSelectTest === 'function') {
      onSelectTest(labTests[0]);
      return;
    }
    const first = labTests[0];
    const reportId = typeof first === 'string' ? first : (first?.reportId || first?.labTestId || first?._id);
    if (!reportId) return;
    setDownloading(true);
    try {
      await downloadClinicalPdf(`/labs/reports/${reportId}/export-pdf`, `MediSync-LabReport-${reportId}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={downloading}
        onClick={handleClick}
        className="glass-button inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-bold hover:bg-purple-500/20 transition-all"
      >
        <Download className="w-3.5 h-3.5 text-purple-400" />
        {downloading ? t('patient.generatingPdf', 'Generating PDF…') : t('patient.downloadLabReportPdf', 'Download Lab Report PDF')}
        {labTests.length > 1 ? ` (${labTests.length})` : ''}
      </button>
      <span className="text-xs text-slate-400 flex items-center gap-1">
        🔒 {t('patient.pdfPasswordNotice', 'Encrypted PDF: open with your NIC number.')}
      </span>
    </div>
  );
};

export default LabReportDownloadButton;
