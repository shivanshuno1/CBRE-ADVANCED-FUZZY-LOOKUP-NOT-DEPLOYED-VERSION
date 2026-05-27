import React from 'react';

function ResultsTable({ results, totalRows }) {
  if (!results || results.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
        No results to display
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Original Value</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matched Abbreviation</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expanded Value</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Match Score</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {results.map((result, idx) => (
              <tr key={idx} className={result.matchScore > 0 ? 'hover:bg-green-50' : 'hover:bg-gray-50'}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{idx + 1}</td>
                <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title={result.originalValue}>
                  {result.originalValue || '(empty)'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                  {result.matchedAbbreviation ? (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                      {result.matchedAbbreviation}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 max-w-md truncate" title={result.expandedValue}>
                  {result.expandedValue || <span className="text-gray-400">—</span>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {result.matchScore > 0 ? (
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div 
                          className="bg-green-500 rounded-full h-2" 
                          style={{ width: `${result.matchScore}%` }}
                        ></div>
                      </div>
                      <span className="text-gray-600">{result.matchScore}%</span>
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalRows > results.length && (
        <div className="px-6 py-3 bg-gray-50 text-center text-sm text-gray-500">
          Showing first {results.length} of {totalRows} rows. Download the full results to see all matches.
        </div>
      )}
    </div>
  );
}

export default ResultsTable;