import React from 'react';

function ColumnSelector({ columns, selectedColumn, onSelect }) {
  if (columns.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center text-gray-500">
          Loading columns...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Select Column for Fuzzy Lookup</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-64 overflow-y-auto">
        {columns.map((col) => (
          <button
            key={col.index}
            onClick={() => onSelect(col.name)}
            className={`p-3 border rounded-lg transition text-left ${
              selectedColumn === col.name
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
            }`}
          >
            <div className="font-mono text-sm text-gray-800 truncate">{col.name}</div>
          </button>
        ))}
      </div>
      {selectedColumn && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            Selected column: <strong>{selectedColumn}</strong>
          </p>
        </div>
      )}
    </div>
  );
}

export default ColumnSelector;