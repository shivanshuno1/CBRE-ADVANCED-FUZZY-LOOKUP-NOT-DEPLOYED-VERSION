import React from 'react';

const ColumnSelector = ({ columns, selectedColumn, onSelect }) => {
  const safe = Array.isArray(columns) ? columns : [];
  return (
    <div>
      <label>Select Column: </label>
      <select value={selectedColumn || ''} onChange={e => onSelect(e.target.value)}>
        <option value="">-- Choose --</option>
        {safe.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
      </select>
    </div>
  );
};
export default ColumnSelector;