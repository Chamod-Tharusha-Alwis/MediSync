import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, ArrowLeft, Users, Building2, Pill, Map } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import LanguageSwitcher from './LanguageSwitcher';

const PublicNavbar = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const navItems = [
    { name: t('nav.doctors', 'Doctors'), path: '/doctors', icon: Users },
    { name: t('nav.hospitals', 'Hospitals'), path: '/hospitals', icon: Building2 },
    { name: t('nav.pharmacies', 'Pharmacies'), path: '/pharmacies', icon: Pill },
    { name: t('nav.publicHealth', 'Public Health'), path: '/public-health', icon: Map },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-lg border-b border-slate-200/60 shadow-sm transition-all duration-300">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center justify-between gap-2 py-2">
        {/* Brand Logo */}
        <Link to="/" className="flex shrink-0 items-center gap-1.5 sm:gap-2.5 group">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform duration-300">
            <Activity className="w-5.5 h-5.5" />
          </div>
          <span className="font-black text-lg sm:text-2xl tracking-tight text-slate-900 bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700">
            Medi<span className="text-blue-600">Sync</span>
          </span>
        </Link>

        {/* Directory Switcher Nav Links */}
        <div className="hidden xl:flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-full border border-slate-200/50">
          {navItems.map((item) => {
            const isActive = currentPath === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`relative flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold transition-all duration-300 ${
                  isActive ? 'text-blue-600' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-nav-pill"
                    className="absolute inset-0 bg-white rounded-full shadow-sm border border-slate-200/30"
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                <Icon className={`w-4 h-4 relative z-10 ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                <span className="relative z-10">{item.name}</span>
              </Link>
            );
          })}
        </div>

        {/* Action Controls: Language Switcher + Back to Home */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <LanguageSwitcher variant="light" compact />
          <button
            onClick={() => navigate('/')}
            aria-label={t('nav.backToHome', 'Back to Home')}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 px-2 xl:px-5 py-2.5 rounded-full text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200/50 shadow-sm transition-all duration-200"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden xl:inline">{t('nav.backToHome', 'Back to Home')}</span>
          </button>
        </div>
      </div>

      {/* Mobile nav indicator bar */}
      <div className="grid grid-cols-4 xl:hidden border-t border-slate-100 bg-white/95 px-2 py-2">
        {navItems.map((item) => {
          const isActive = currentPath === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex min-w-0 min-h-[44px] flex-col items-center justify-center gap-1 py-1 px-1 text-[10px] sm:text-xs font-bold transition-colors ${
                isActive ? 'text-blue-600' : 'text-slate-500'
              }`}
            >
              <Icon className="w-4.5 h-4.5" />
              <span className="max-w-full break-words text-center leading-snug">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default PublicNavbar;
