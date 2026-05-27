import React, { useState } from 'react';
import axios from 'axios';
import ResultsTable from './ResultsTable';
import DownloadButton from './DownloadButton';

function ColumnComparer({ uploadId, sheetName, columns, customMappings }) {
  const [leftColumn, setLeftColumn] = useState('');
  const [rightColumn, setRightColumn] = useState('');
  const [threshold, setThreshold] = useState(60);
  const [expandLeft, setExpandLeft] = useState(true);
  const [expandRight, setExpandRight] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [processId, setProcessId] = useState(null);
  const [error, setError] = useState('');

  const handleCompare = async () => {
    if (!leftColumn || !rightColumn) {
      setError('Please select both columns');
      return;
    }
    setProcessing(true);
    setError('');
    try {
      const response = await axios.post('/api/fuzzy-compare-enhanced', {
        uploadId,
        sheetName,
        columnLeft: leftColumn,
        columnRight: rightColumn,
        customMappings,
        threshold,
        expandLeft,
        expandRight
      });
      setResults(response.data);
      setProcessId(response.data.processId);
    } catch (err) {
      setError('Comparison failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setProcessing(false);
    }
  };

  // Transform results for ResultsTable (which expects originalValue, matchedAbbreviation, expandedValue, matchScore)
  const tableResults = results?.preview.map(r => ({
    originalValue: `${r.originalLeft} ↔ ${r.originalRight}`,
    matchedAbbreviation: '',
    expandedValue: `Score: ${r.similarityScore}% ${r.isMatch ? '✓' : '✗'}`,
    matchScore: r.similarityScore
  })) || [];

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
      <h3 className="text-lg font-semibold text-gray-800">🔍 Fuzzy Compare Two Columns (with Abbreviation Expansion)</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Left Column</label>
          <select
            value={leftColumn}
            onChange={(e) => setLeftColumn(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="">Select column</option>
            {columns.map(col => (
              <option key={col.index} value={col.name}>{col.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Right Column</label>
          <select
            value={rightColumn}
            onChange={(e) => setRightColumn(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="">Select column</option>
            {columns.map(col => (
              <option key={col.index} value={col.name}>{col.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-4 items-center">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={expandLeft} onChange={(e) => setExpandLeft(e.target.checked)} />
          Expand abbreviations in LEFT column
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={expandRight} onChange={(e) => setExpandRight(e.target.checked)} />
          Expand abbreviations in RIGHT column
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Similarity Threshold ({threshold}%)
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={threshold}
          onChange={(e) => setThreshold(parseInt(e.target.value))}
          className="w-full"
        />
      </div>

      <button
        onClick={handleCompare}
        disabled={processing || !leftColumn || !rightColumn}
        className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
      >
        {processing ? 'Comparing...' : 'Compare Columns'}
      </button>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {results && (
        <div className="mt-4">
          <div className="bg-green-50 p-3 rounded flex justify-between items-center">
            <span>Matched {results.matchedCount} of {results.totalRows} rows (score ≥ {threshold}%)</span>
            <DownloadButton processId={processId} />
          </div>
          <ResultsTable results={tableResults} totalRows={results.totalRows} />
        </div>
      )}
    </div>
  );
}

export default ColumnComparer;