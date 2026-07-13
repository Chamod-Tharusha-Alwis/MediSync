import React from 'react';

export const SkeletonLine = ({ className = '', width = 'w-full', height = 'h-4' }) => {
  return (
    <div
      className={`animate-pulse bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 rounded ${height} ${width} ${className}`}
    />
  );
};

export const SkeletonCircle = ({ className = '', size = 'w-12 h-12' }) => {
  return (
    <div
      className={`animate-pulse bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 rounded-full ${size} ${className}`}
    />
  );
};

export const SkeletonCard = ({ className = '' }) => {
  return (
    <div className={`p-5 rounded-2xl border border-white/5 bg-slate-900/40 flex flex-col gap-4 ${className}`}>
      <div className="flex items-center gap-3">
        <SkeletonCircle size="w-10 h-10" />
        <div className="flex-1 flex flex-col gap-2">
          <SkeletonLine width="w-2/3" height="h-4" />
          <SkeletonLine width="w-1/3" height="h-3" />
        </div>
      </div>
      <div className="flex flex-col gap-2 mt-2">
        <SkeletonLine width="w-full" height="h-3" />
        <SkeletonLine width="w-5/6" height="h-3" />
        <SkeletonLine width="w-4/6" height="h-3" />
      </div>
    </div>
  );
};

const Skeleton = {
  Line: SkeletonLine,
  Circle: SkeletonCircle,
  Card: SkeletonCard
};

export default Skeleton;
