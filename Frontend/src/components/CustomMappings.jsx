import React, { useState } from 'react';

function CustomMappings({ mappings, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [newShort, setNewShort] = useState('');
  const [newFull, setNewFull] = useState('');

  const handleAdd = () => {
    if (newShort && newFull) {
      onChange([...mappings, { short: newShort.toUpperCase(), full: newFull }]);
      setNewShort('');
      setNewFull('');
      setShowForm(false);
    }
  };

  const handleRemove = (index) => {
    const newMappings = mappings.filter((_, i) => i !== index);
    onChange(newMappings);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Custom Abbreviation Mappings</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          {showForm ? 'Cancel' : '+ Add Custom'}
        </button>
      </div>
      
      {showForm && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Abbreviation (e.g., CTO)"
              value={newShort}
              onChange={(e) => setNewShort(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Full Form (e.g., Chief Technology Officer)"
              value={newFull}
              onChange={(e) => setNewFull(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleAdd}
            className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
          >
            Add Mapping
          </button>
        </div>
      )}
      
      {mappings.length > 0 && (
        <div className="space-y-2">
          {mappings.map((mapping, idx) => (
            <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
              <div>
                <span className="font-mono font-bold text-blue-600">{mapping.short}</span>
                <span className="mx-2 text-gray-400">→</span>
                <span className="text-gray-700">{mapping.full}</span>
              </div>
              <button
                onClick={() => handleRemove(idx)}
                className="text-red-500 hover:text-red-700 text-sm"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      
      {mappings.length === 0 && !showForm && (
        <p className="text-gray-500 text-sm">No custom mappings added. Using default dictionary.</p>
      )}
    </div>
  );
}

export default CustomMappings;