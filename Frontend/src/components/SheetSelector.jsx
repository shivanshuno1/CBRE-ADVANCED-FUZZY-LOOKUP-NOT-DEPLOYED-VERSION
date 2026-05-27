import React from 'react';

function SheetSelector({ sheets, onSelect }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Select Sheet</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {sheets.map((sheet) => (
          <button
            key={sheet.name}
            onClick={() => onSelect(sheet.name)}
            className="p-3 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition text-left"
          >
            <div className="font-medium text-gray-800">{sheet.name}</div>
            <div className="text-xs text-gray-500">{sheet.rows} rows</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default SheetSelector;