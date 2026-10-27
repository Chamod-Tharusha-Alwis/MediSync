import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { AlertCircle } from 'lucide-react';

const EmptyState = ({
  icon: Icon = AlertCircle,
  title,
  description,
  actionText,
  onAction
}) => {
  const { t } = useTranslation();
  const displayTitle = title || t("common.noData", "No records found");
  const displayDesc = description || t("common.noDataDesc", "There is no data to display at this moment.");

  return (
    <div className="flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-white/5 bg-slate-900/20 backdrop-blur-sm max-w-md mx-auto">
      <div className="p-4 rounded-full bg-slate-950 border border-white/10 text-slate-500 mb-4 shadow-inner">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-bold text-slate-100 mb-2">{displayTitle}</h3>
      <p className="text-sm text-slate-400 leading-relaxed mb-6">{displayDesc}</p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="glass-button text-sm px-5 py-2.5"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
