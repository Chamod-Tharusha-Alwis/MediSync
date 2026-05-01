import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NavLink, useNavigate } from 'react-router-dom';
import { FiLogOut, FiMenu, FiX } from 'react-icons/fi';
import { FaUserCircle } from 'react-icons/fa';

const Sidebar = ({ role, links, userName }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('role');
    navigate('/' + role + '/login');
  };

  const navContent = (
    <div className="flex flex-col h-full">
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xl">M</span>
          </div>
          {isOpen && <span className="text-xl font-bold text-gray-800">MediSync</span>}
        </div>
        {!isMobileOpen && (
          <button onClick={() => setIsOpen(!isOpen)} className="text-gray-500 hover:text-primary hidden md:block">
            <FiMenu size={24} />
          </button>
        )}
        {isMobileOpen && (
          <button onClick={() => setIsMobileOpen(false)} className="text-gray-500 md:hidden">
            <FiX size={24} />
          </button>
        )}
      </div>

      <div className="flex-1 px-4 space-y-2 overflow-y-auto mt-6">
        {links.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            onClick={() => isMobileOpen && setIsMobileOpen(false)}
            className={({ isActive }) => `
              flex items-center px-4 py-3 rounded-lg transition-all duration-200
              ${isActive 
                ? 'bg-primary/10 text-primary border-l-4 border-primary' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-primary hover:translate-x-1 border-l-4 border-transparent'}
            `}
          >
            <link.icon className={`${isOpen ? 'mr-4' : 'mx-auto'} w-5 h-5`} />
            {isOpen && <span className="font-medium whitespace-nowrap">{link.label}</span>}
          </NavLink>
        ))}
      </div>

      <div className="p-4 border-t border-gray-100">
        <div className={`flex items-center ${isOpen ? 'justify-between' : 'justify-center'} px-4 py-2`}>
          <div className="flex items-center space-x-3">
            <FaUserCircle className="text-gray-400 w-8 h-8" />
            {isOpen && (
              <div>
                <p className="text-sm font-semibold text-gray-800 truncate w-32">{userName || 'User'}</p>
                <p className="text-xs text-gray-500 capitalize">{role.replace('_', ' ')}</p>
              </div>
            )}
          </div>
          {isOpen && (
            <button onClick={handleLogout} className="text-danger hover:bg-danger/10 p-2 rounded-lg transition-colors">
              <FiLogOut size={20} />
            </button>
          )}
        </div>
        {!isOpen && (
          <button onClick={handleLogout} className="mt-4 text-danger flex justify-center w-full">
            <FiLogOut size={24} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Toggle */}
      <button 
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-sm"
        onClick={() => setIsMobileOpen(true)}
      >
        <FiMenu size={24} />
      </button>

      {/* Desktop Sidebar */}
      <motion.div 
        animate={{ width: isOpen ? 280 : 88 }}
        className="hidden md:block fixed left-0 top-0 h-screen bg-white border-r border-gray-200 shadow-sm z-40 transition-all duration-300"
      >
        {navContent}
      </motion.div>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileOpen(false)}
              className="md:hidden fixed inset-0 bg-black/50 z-40"
            />
            <motion.div 
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              className="md:hidden fixed left-0 top-0 h-screen w-[280px] bg-white shadow-xl z-50"
            >
              {navContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;
