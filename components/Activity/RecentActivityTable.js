import React, { useState, useEffect, useMemo } from 'react';
import ActivityFilters from './ActivityFilters';
import Pagination from './Pagination';

const RecentActivityTable = ({ data }) => {
  const [stageFilter, setStageFilter] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Filter data
  const filteredData = useMemo(() => {
    let filtered = data.recentActivity;
    
    if (stageFilter !== 'all') {
      filtered = filtered.filter(activity => activity.stage === stageFilter);
    }
    
    if (campaignFilter !== 'all') {
      filtered = filtered.filter(activity => activity.campaign_code === campaignFilter);
    }
    
    return filtered;
  }, [data.recentActivity, stageFilter, campaignFilter]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [stageFilter, campaignFilter]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPageData = filteredData.slice(startIndex, endIndex);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Recent Pipeline Activity</h3>
            <p className="text-sm text-gray-500 mt-1">
              Showing {filteredData.length} activities from selected date range
            </p>
          </div>
          <ActivityFilters
            stageFilter={stageFilter}
            campaignFilter={campaignFilter}
            availableCampaigns={data.availableCampaigns}
            onStageFilterChange={setStageFilter}
            onCampaignFilterChange={setCampaignFilter}
          />
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                New Stage
                {stageFilter !== 'all' && (
                  <span className="ml-1 text-blue-600">• Filtered</span>
                )}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Campaign Code
                {campaignFilter !== 'all' && (
                  <span className="ml-1 text-blue-600">• Filtered</span>
                )}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Lead Source
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Previous Stage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentPageData.map((activity, index) => (
              <tr key={startIndex + index} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{activity.name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    activity.stage === 'ACQ - Qualified' 
                      ? 'bg-blue-100 text-blue-800' 
                      : activity.stage === 'ACQ - Offers Made'
                      ? 'bg-green-100 text-green-800'
                      : activity.stage === 'ACQ - Price Motivated'
                      ? 'bg-yellow-100 text-yellow-800'
                      : activity.stage === 'Throwaway Lead'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {activity.stage}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full">
                    {activity.campaign_code}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    activity.lead_source === 'ReadyMode' 
                      ? 'bg-blue-100 text-blue-800'
                      : activity.lead_source === 'Roor'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {activity.lead_source}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                    {activity.previous_stage}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {new Date(activity.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredData.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-lg font-medium">No pipeline activity found</p>
            <p className="text-sm mt-2">No stage changes found for the selected time period and filters</p>
          </div>
        )}
      </div>
      
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredData.length}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
      />
    </div>
  );
};

export default RecentActivityTable;