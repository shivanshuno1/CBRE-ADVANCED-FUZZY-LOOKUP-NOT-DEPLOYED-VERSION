import React from 'react';

const SheetSelector = ({ sheets, onSelect }) => {
  const safe = Array.isArray(sheets) ? sheets : [];
  return (
    <div>
      <label>Select Sheet: </label>
      <select onChange={e => onSelect(e.target.value)}>
        <option value="">-- Choose --</option>
        {safe.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
      </select>
    </div>
  );
};
export default SheetSelector;