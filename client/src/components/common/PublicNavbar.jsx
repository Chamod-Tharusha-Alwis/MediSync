import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, ArrowLeft, Users, Building2, Pill } from 'lucide-react';

const PublicNavbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const navItems = [
    { name: 'Doctors', path: '/doctors', icon: Users },
    { name: 'Hospitals', path: '/hospitals', icon: Building2 },
    { name: 'Pharmacies', path: '/pharmacies', icon: Pill },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-lg border-b border-slate-200/60 shadow-sm transition-all duration-300">
      <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between py-4">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform duration-300">
            <Activity className="w-5.5 h-5.5" />
          </div>
          <span className="font-black text-2xl tracking-tight text-slate-900 bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700">
            Medi<span className="text-blue-600">Sync</span>
          </span>
        </Link>

        {/* Directory Switcher Nav Links */}
        <div className="hidden sm:flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-full border border-slate-200/50">
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

        {/* Action Button: Back to Home */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200/50 shadow-sm transition-all duration-200 hover:scale-103"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>
      </div>

      {/* Mobile nav indicator bar */}
      <div className="flex sm:hidden border-t border-slate-100 bg-white/95 px-4 py-2 justify-around">
        {navItems.map((item) => {
          const isActive = currentPath === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-bold transition-colors ${
                isActive ? 'text-blue-600' : 'text-slate-500'
              }`}
            >
              <Icon className="w-4.5 h-4.5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default PublicNavbar;
