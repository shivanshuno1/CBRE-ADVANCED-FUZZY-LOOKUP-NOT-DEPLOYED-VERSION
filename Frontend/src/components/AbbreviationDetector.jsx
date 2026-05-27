import React, { useState } from 'react';
import axios from 'axios';

function AbbreviationDetector({ uploadId, sheetName, columnName, onAddMappings, existingMappings }) {
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState('');
  const [aiExpanding, setAiExpanding] = useState(false);

  const handleDetect = async () => {
    setDetecting(true);
    setError('');
    try {
      const response = await axios.post('/api/detect-abbreviations', { 
        uploadId, sheetName, columnName, sampleSize: 5000 
      });
      const allDetected = response.data.detected || [];
      const expansions = response.data.expansions || [];
      
      // Filter out ones already in existing mappings
      const existingShorts = new Set(existingMappings.map(m => m.short.toUpperCase()));
      const newDetected = allDetected.filter(abbr => !existingShorts.has(abbr));
      
      setDetected(newDetected);
      setSelected(new Set());
      
      // Automatically add AI‑expanded ones (full form provided)
      if (expansions && expansions.length) {
        const newMappings = expansions
          .filter(exp => !existingShorts.has(exp.short))
          .map(exp => ({ short: exp.short, full: exp.full }));
        if (newMappings.length) {
          onAddMappings(newMappings);
          // Remove them from detected list
          setDetected(prev => prev.filter(abbr => !newMappings.some(m => m.short === abbr)));
        }
      }
    } catch (err) {
      setError('Detection failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setDetecting(false);
    }
  };

  const handleManualAIExpand = async () => {
    if (selected.size === 0) return;
    setAiExpanding(true);
    try {
      const items = Array.from(selected).map(abbr => ({ abbreviation: abbr, context: '' }));
      const response = await axios.post('/api/expand-abbreviations', { items });
      const expansions = response.data.expansions || [];
      if (expansions.length) {
        onAddMappings(expansions);
        // Remove expanded ones from detected list
        const expandedShorts = new Set(expansions.map(e => e.short));
        setDetected(prev => prev.filter(abbr => !expandedShorts.has(abbr)));
        setSelected(new Set());
      } else {
        setError('AI could not expand any selected abbreviations.');
      }
    } catch (err) {
      setError('AI expansion failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setAiExpanding(false);
    }
  };

  const toggleSelect = (abbr) => {
    const newSet = new Set(selected);
    if (newSet.has(abbr)) newSet.delete(abbr);
    else newSet.add(abbr);
    setSelected(newSet);
  };

  const selectAll = () => {
    if (selected.size === detected.length) setSelected(new Set());
    else setSelected(new Set(detected));
  };

  const addSelectedAsManual = () => {
    const toAdd = Array.from(selected).map(abbr => ({ short: abbr, full: '' }));
    if (toAdd.length > 0) {
      onAddMappings(toAdd);
      setDetected(detected.filter(abbr => !selected.has(abbr)));
      setSelected(new Set());
    }
  };

  if (!columnName) return null;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">🔍 Auto-Detect Unknown Abbreviations</h3>
        <button onClick={handleDetect} disabled={detecting} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm">
          {detecting ? 'Scanning...' : 'Detect from Column'}
        </button>
      </div>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      {detected.length > 0 && (
        <div className="mt-3">
          <p className="text-sm text-gray-600 mb-2">Found {detected.length} potential abbreviation(s) not in your custom list:</p>
          <div className="max-h-48 overflow-y-auto border rounded-lg p-2 bg-gray-50">
            {detected.map(abbr => (
              <label key={abbr} className="flex items-center space-x-2 p-1 hover:bg-gray-100 rounded">
                <input type="checkbox" checked={selected.has(abbr)} onChange={() => toggleSelect(abbr)} className="rounded" />
                <span className="font-mono text-sm">{abbr}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 justify-between items-center mt-3">
            <button onClick={selectAll} className="text-sm text-blue-600 hover:text-blue-800">Select All</button>
            <div className="space-x-2">
              <button onClick={addSelectedAsManual} disabled={selected.size === 0} className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50 text-sm">
                Add as Empty
              </button>
              <button onClick={handleManualAIExpand} disabled={selected.size === 0 || aiExpanding} className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm">
                {aiExpanding ? 'AI Expanding...' : `AI Expand Selected (${selected.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
      {detected.length === 0 && !detecting && columnName && (
        <p className="text-gray-500 text-sm">Click "Detect" to find uppercase sequences (potential abbreviations) in this column. AI will auto‑expand them when possible.</p>
      )}
    </div>
  );
}

export default AbbreviationDetector;