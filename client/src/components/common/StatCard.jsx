import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * StatCard — Premium glassmorphic KPI tile  (common/StatCard)
 *
 * This version is the "common" variant used across all role dashboards.
 * API is intentionally identical to components/StatCard so callers can
 * swap between the two without prop changes.
 *
 * Props:
 *   title      {string}        — metric label
 *   value      {string|number} — displayed value; numbers animate on mount
 *   icon       {Component}     — Lucide or react-icons component
 *   gradient   {string}        — Tailwind gradient e.g. "from-teal-500 to-cyan-500"
 *   change     {string}        — optional trend string e.g. "+12%"
 *   suffix     {string}        — optional unit e.g. "%"
 *   delay      {number}        — stagger delay in seconds
 *   onClick    {function}      — optional click handler
 */
const StatCard = ({
  title,
  value,
  icon: Icon,
  gradient = 'from-teal-500 to-cyan-500',
  change,
  suffix = '',
  delay = 0,
  onClick,
}) => {
  const numericTarget = parseInt(value);
  const isNumeric     = !isNaN(numericTarget) && typeof value !== 'boolean';
  const [count, setCount] = useState(isNumeric ? 0 : null);
  const rafRef = useRef(null);

  /* RAF-based ease-out cubic counter */
  useEffect(() => {
    if (!isNumeric) return;
    const duration = 900;
    const start    = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * numericTarget));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [numericTarget, isNumeric]);

  const isPositive = change && (change.startsWith('+') || parseFloat(change) > 0);
  const isNegative = change && (change.startsWith('-') || parseFloat(change) < 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`
        glass-card-premium neumorphic-flat
        relative overflow-hidden group
        p-6 rounded-2xl border border-white/5
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
      `}
    >
      {/* Ambient glow orb */}
      <div
        className={`
          absolute -top-8 -right-8 w-36 h-36
          bg-gradient-to-br ${gradient}
          opacity-[0.10] rounded-full blur-2xl
          group-hover:opacity-[0.22] transition-opacity duration-500
        `}
        aria-hidden="true"
      />

      {/* Top-edge shimmer line */}
      <div
        className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent"
        aria-hidden="true"
      />

      <div className="relative z-10 flex items-start justify-between gap-4">
        {/* Left — label + value + trend */}
        <div className="min-w-0">
          <p className="label-caps mb-2 truncate">{title}</p>

          <h3 className="text-3xl font-extrabold text-white tracking-tight leading-none tabular-nums">
            {isNumeric ? count : value}
            {isNumeric && suffix && (
              <span className="text-xl font-bold text-slate-400 ml-0.5">{suffix}</span>
            )}
          </h3>

          {change && (
            <p className={`
              mt-2 text-xs font-semibold flex items-center gap-1
              ${isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-slate-400'}
            `}>
              {isPositive && <span aria-hidden>↑</span>}
              {isNegative && <span aria-hidden>↓</span>}
              {change}
              <span className="text-slate-500 font-normal">vs last month</span>
            </p>
          )}
        </div>

        {/* Right — icon pill */}
        {Icon && (
          <div
            className={`
              flex-shrink-0 p-3.5 rounded-2xl
              bg-gradient-to-br ${gradient}
              shadow-lg shadow-black/30
              group-hover:scale-110 group-hover:rotate-3
              transition-transform duration-300 ease-out
            `}
          >
            <Icon className="w-5 h-5 text-white" strokeWidth={2.2} />
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default StatCard;
