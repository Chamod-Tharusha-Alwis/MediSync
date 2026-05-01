import React from 'react';

const LoadingSkeleton = ({ variant = 'card', count = 1 }) => {
  const elements = Array.from({ length: count });

  if (variant === 'table') {
    return (
      <div className="w-full bg-white rounded-lg shadow-sm p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-200 rounded w-full"></div>
          {elements.map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded w-full"></div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'profile') {
    return (
      <div className="animate-pulse flex items-center space-x-4">
        <div className="rounded-full bg-gray-200 h-16 w-16"></div>
        <div className="flex-1 space-y-2 py-1">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {elements.map((_, i) => (
        <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-pulse">
          <div className="flex items-center space-x-4">
            <div className="rounded-full bg-gray-200 h-12 w-12"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-6 bg-gray-200 rounded w-3/4"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LoadingSkeleton;
