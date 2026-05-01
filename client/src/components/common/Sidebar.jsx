import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, Activity } from 'lucide-react';
import api from '../../api/axiosInstance';

const Sidebar = ({ menuItems, title = "MediSync", themePrefix = "doctor" }) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      navigate('/select-role');
    }
  };

  const themeColors = {
    doctor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    hospital: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    admin: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    pharmacy: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    patient: "text-rose-400 bg-rose-500/10 border-rose-500/20"
  };

  const activeColor = themeColors[themePrefix] || themeColors.doctor;

  return (
    <motion.aside 
      initial={{ x: -280 }}
      animate={{ x: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-64 h-screen fixed left-0 top-0 glass-panel border-r flex flex-col z-40"
    >
      <div className="p-6 flex items-center gap-3 border-b border-slate-700/50">
        <div className="p-2 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 shadow-inner">
          <Activity className={`w-6 h-6 ${activeColor.split(' ')[0]}`} />
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">{title}</h1>
      </div>

      <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto custom-scrollbar">
        {menuItems.map((item, idx) => (
          <NavLink
            key={idx}
            to={item.path}
            end={item.end}
            className={({ isActive }) => `
              w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
              ${isActive 
                ? `${activeColor} border shadow-sm` 
                : 'text-slate-400 border-transparent hover:text-white hover:bg-slate-800/50'}
            `}
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-700/50">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 hover:border hover:border-red-500/20 transition-all duration-300"
        >
          <LogOut className="w-5 h-5" />
          <span>Log Out</span>
        </button>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
