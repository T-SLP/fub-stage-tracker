import React from 'react';

const ChartControls = ({ visibleLines, onLineToggle }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Chart Display Options</h3>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={visibleLines.qualified}
            onChange={() => onLineToggle('qualified')}
            className="mr-2"
          />
          <span className="flex items-center">
            <div className="w-4 h-4 bg-blue-600 rounded mr-2"></div>
            Qualified Leads
          </span>
        </label>
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={visibleLines.offers}
            onChange={() => onLineToggle('offers')}
            className="mr-2"
          />
          <span className="flex items-center">
            <div className="w-4 h-4 bg-orange-600 rounded mr-2"></div>
            Offers Made
          </span>
        </label>
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={visibleLines.priceMotivated}
            onChange={() => onLineToggle('priceMotivated')}
            className="mr-2"
          />
          <span className="flex items-center">
            <div className="w-4 h-4 bg-yellow-600 rounded mr-2"></div>
            Price Motivated
          </span>
        </label>
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={visibleLines.throwawayLeads}
            onChange={() => onLineToggle('throwawayLeads')}
            className="mr-2"
          />
          <span className="flex items-center">
            <div className="w-4 h-4 bg-red-600 rounded mr-2"></div>
            Throwaway Leads
          </span>
        </label>
      </div>
    </div>
  );
};

export default ChartControls;