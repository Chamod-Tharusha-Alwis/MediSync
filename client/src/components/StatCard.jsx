import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const StatCard = ({ title, value, icon: Icon, color, change }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = parseInt(value) || 0;
    if (end === 0) return;

    const duration = 1000;
    const incrementTime = Math.abs(Math.floor(duration / end));

    const timer = setInterval(() => {
      start += 1;
      setCount(start);
      if (start >= end) clearInterval(timer);
    }, incrementTime);

    return () => clearInterval(timer);
  }, [value]);

  const colorMap = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger'
  };

  return (
    <motion.div 
      whileHover={{ scale: 1.02 }}
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center space-x-4"
    >
      <div className={`p-4 rounded-full ${colorMap[color] || colorMap.primary}`}>
        {Icon && <Icon className="w-8 h-8" />}
      </div>
      <div>
        <p className="text-gray-500 text-sm font-medium">{title}</p>
        <h3 className="text-2xl font-bold text-gray-800">
          {isNaN(value) ? value : count}
        </h3>
        {change && (
          <p className={`text-sm mt-1 ${change.startsWith('+') ? 'text-success' : 'text-danger'}`}>
            {change} from last month
          </p>
        )}
      </div>
    </motion.div>
  );
};

export default StatCard;
