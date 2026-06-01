import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X, Activity, ChevronRight } from 'lucide-react';

/**
 * Sidebar — Premium glassmorphic navigation rail (components/Sidebar)
 *
 * Supports BOTH prop APIs:
 *   Legacy:  { role, links, userName }
 *     – links: [{ path, label, icon }]
 *     – role:  string used for logout redirect and theme
 *
 *   Modern:  { menuItems, themePrefix, title, userName, userRole }
 *     – menuItems: [{ path, label, icon, end? }]
 *
 * Callers can use either set; the component normalises internally.
 */
const Sidebar = ({
  /* Legacy API */
  role,
  links,
  /* Modern API */
  menuItems,
  themePrefix,
  title = 'MediSync',
  userName,
  userRole,
}) => {
  const navigate = useNavigate();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  /* Normalise props so the body only works with one set */
  const resolvedItems  = menuItems ?? links ?? [];
  const resolvedTheme  = themePrefix ?? role ?? 'doctor';
  const resolvedRole   = userRole ?? (role ? role.replace(/_/g, ' ') : undefined);

  /* ── Theme colour maps ────────────────────────────────────────────────── */
  const accentMap = {
    doctor:   { text: 'text-emerald-400', bg: 'bg-emerald-500/10',  border: 'border-emerald-500/25', icon: 'from-emerald-500 to-teal-500',   glow: 'shadow-emerald-500/20' },
    hospital: { text: 'text-purple-400',  bg: 'bg-purple-500/10',   border: 'border-purple-500/25',  icon: 'from-purple-500 to-fuchsia-500', glow: 'shadow-purple-500/20'  },
    admin:    { text: 'text-blue-400',    bg: 'bg-blue-500/10',     border: 'border-blue-500/25',    icon: 'from-blue-500 to-cyan-500',      glow: 'shadow-blue-500/20'    },
    pharmacy: { text: 'text-amber-400',   bg: 'bg-amber-500/10',    border: 'border-amber-500/25',   icon: 'from-amber-500 to-orange-500',   glow: 'shadow-amber-500/20'   },
    patient:  { text: 'text-rose-400',    bg: 'bg-rose-500/10',     border: 'border-rose-500/25',    icon: 'from-rose-500 to-pink-500',      glow: 'shadow-rose-500/20'    },
  };
  const accent = accentMap[resolvedTheme] || accentMap.doctor;

  /* ── Logout ───────────────────────────────────────────────────────────── */
  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate(role ? `/${role}/login` : '/select-role');
  };

  /* ── Nav item ─────────────────────────────────────────────────────────── */
  const NavItem = ({ item }) => (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={() => setIsMobileOpen(false)}
      className={({ isActive }) => `
        group/item relative flex items-center gap-3 px-4 py-3 rounded-xl
        border transition-all duration-200 text-sm font-medium
        ${isActive
          ? `${accent.text} ${accent.bg} ${accent.border} shadow-md ${accent.glow}`
          : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-slate-800/50 hover:border-white/5'
        }
      `}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-gradient-to-b ${accent.icon}`}
              aria-hidden="true"
            />
          )}

          {item.icon && (
            <item.icon
              className={`
                w-4.5 h-4.5 flex-shrink-0 transition-transform duration-200
                ${isActive ? accent.text : 'text-slate-500 group-hover/item:text-slate-300'}
                ${!isActive ? 'group-hover/item:scale-110' : ''}
              `}
              strokeWidth={isActive ? 2.5 : 2}
            />
          )}

          <span className="flex-1 truncate">{item.label}</span>

          {isActive && (
            <ChevronRight className={`w-3.5 h-3.5 ${accent.text} opacity-60`} />
          )}
        </>
      )}
    </NavLink>
  );

  /* ── Shared sidebar content ───────────────────────────────────────────── */
  const SidebarContent = () => (
    <div className="flex flex-col h-full">

      {/* Brand header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/6">
        <div
          className={`relative p-2.5 rounded-xl bg-gradient-to-br ${accent.icon} shadow-lg ${accent.glow}`}
        >
          <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
          <span
            className={`absolute inset-0 rounded-xl bg-gradient-to-br ${accent.icon} opacity-40 blur-md -z-10`}
            aria-hidden="true"
          />
        </div>
        <div>
          <h1 className="text-base font-bold text-white tracking-tight leading-none">{title}</h1>
          <p className={`text-[10px] font-semibold uppercase tracking-widest mt-0.5 ${accent.text}`}>
            {resolvedTheme} portal
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto custom-scrollbar">
        {resolvedItems.map((item, idx) => (
          <NavItem key={item.path ?? idx} item={item} />
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 border-t border-white/6 pt-4 space-y-2">
        {/* User badge */}
        {userName && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${accent.bg} border ${accent.border}`}>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${accent.icon} font-bold text-white text-sm shadow-md ${accent.glow}`}
            >
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100 truncate leading-none">{userName}</p>
              {resolvedRole && (
                <p className={`text-[10px] font-medium mt-0.5 capitalize ${accent.text}`}>{resolvedRole}</p>
              )}
            </div>
          </div>
        )}

        {/* Logout */}
        <motion.button
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleLogout}
          className="
            w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
            text-slate-400 border border-transparent
            hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20
            transition-all duration-200
          "
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span>Log Out</span>
        </motion.button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="md:hidden fixed top-4 left-4 z-50 p-2.5 rounded-xl glass-panel border border-white/10 text-slate-300 shadow-lg"
        onClick={() => setIsMobileOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="w-5 h-5" />
      </motion.button>

      {/* Desktop sidebar */}
      <motion.aside
        initial={{ x: -280, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 z-40 glass-panel border-r border-white/6"
        aria-label="Sidebar"
      >
        <SidebarContent />
      </motion.aside>

      {/* Mobile drawer + backdrop */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsMobileOpen(false)}
              className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              aria-hidden="true"
            />
            <motion.aside
              key="drawer"
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="md:hidden fixed left-0 top-0 bottom-0 w-[280px] z-50 glass-panel border-r border-white/6"
              aria-label="Mobile navigation"
            >
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => setIsMobileOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
                aria-label="Close navigation"
              >
                <X className="w-4 h-4" />
              </motion.button>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;
