import React from 'react';
import { Filter } from 'lucide-react';

const ActivityFilters = ({ 
  stageFilter, 
  campaignFilter, 
  availableCampaigns, 
  onStageFilterChange, 
  onCampaignFilterChange 
}) => {
  return (
    <div className="flex items-center space-x-4">
      <div className="flex items-center space-x-2">
        <Filter className="text-gray-400" size={20} />
        <label className="text-sm text-gray-600 font-medium">Stage:</label>
        <select
          value={stageFilter}
          onChange={(e) => onStageFilterChange(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Stages</option>
          <option value="ACQ - Qualified">ACQ - Qualified</option>
          <option value="ACQ - Offers Made">ACQ - Offers Made</option>
          <option value="ACQ - Price Motivated">ACQ - Price Motivated</option>
        </select>
      </div>
      <div className="flex items-center space-x-2">
        <label className="text-sm text-gray-600 font-medium">Campaign:</label>
        <select
          value={campaignFilter}
          onChange={(e) => onCampaignFilterChange(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Campaigns</option>
          {availableCampaigns.map(campaign => (
            <option key={campaign} value={campaign}>{campaign}</option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default ActivityFilters;