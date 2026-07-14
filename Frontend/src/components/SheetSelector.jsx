import React from 'react';

const SheetSelector = ({ sheets, onSelect }) => {
  const safe = Array.isArray(sheets) ? sheets : [];
  return (
    <div className="spaced">
      <div className="muted">Select Sheet</div>
      <div className="list">
        <button className="btn" onClick={() => onSelect('')}>-- Choose --</button>
        {safe.map(s => (
          <button key={s.name} className="btn" onClick={() => onSelect(s.name)}>
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SheetSelector;