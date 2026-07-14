import React from 'react';

const ColumnSelector = ({ columns, selectedColumn, onSelect }) => {
  const safe = Array.isArray(columns) ? columns : [];
  return (
    <div className="spaced">
      <div className="muted">Select Column</div>
      <div className="list">
        <button className={`btn ${selectedColumn === '' ? 'active' : ''}`} onClick={() => onSelect('')}>-- Choose --</button>
        {safe.map(c => (
          <button key={c.name} className={`btn ${selectedColumn === c.name ? 'active' : ''}`} onClick={() => onSelect(c.name)}>
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ColumnSelector;