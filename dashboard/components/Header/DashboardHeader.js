import React from 'react';

const DashboardHeader = ({ children }) => {
  return (
    <div className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">FUB Pipeline Dashboard</h1>
            <p className="text-gray-600 mt-1">
              Track qualified leads, offers made, and price motivated leads with advanced metrics
            </p>
          </div>
          <div className="flex items-center space-x-4 flex-wrap">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardHeader;