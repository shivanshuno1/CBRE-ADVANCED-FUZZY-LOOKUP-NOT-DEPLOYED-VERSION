import React, { useState } from 'react';
import FileUploader from './components/FileUploader';
import SheetSelector from './components/SheetSelector';
import ColumnSelector from './components/ColumnSelector';
import ColumnComparer from './components/ColumnComparer';
import MultiKeyComparer from './components/MultiKeyComparer';
import axios from 'axios';

function App() {
  const [uploadId, setUploadId]         = useState(null);
  const [sheets, setSheets]             = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [columns, setColumns]           = useState([]);
  const [selectedColumn, setSelectedColumn] = useState('');
  const [mode, setMode]                 = useState('abbrev');
  const [error, setError]               = useState('');

  const handleUploadSuccess = (data) => {
    setUploadId(data.uploadId);
    setSheets(data.sheets);
    setError('');
  };

  const handleSheetSelect = async (sheetName) => {
    setSelectedSheet(sheetName);
    try {
      const res = await axios.get(`http://localhost:5000/api/columns/${uploadId}/${sheetName}`);
      setColumns(Array.isArray(res.data.columns) ? res.data.columns : []);
    } catch (err) {
      setError('Failed to load columns');
    }
  };

  const btnStyle = (active) => ({
    marginRight: 10,
    padding: '6px 14px',
    background: active ? '#2563eb' : '#e5e7eb',
    color: active ? '#fff' : '#374151',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: active ? 700 : 400,
    fontSize: 14
  });

  return (
    <div style={{ padding: 24, fontFamily: 'Arial, sans-serif', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4 }}>Excel Fuzzy Lookup</h1>

      {!uploadId ? (
        <FileUploader onUploadSuccess={handleUploadSuccess} onError={setError} />
      ) : (
        <>
          <div style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <button onClick={() => setMode('abbrev')} style={btnStyle(mode === 'abbrev')}>
              Abbreviation Mode
            </button>
            <button onClick={() => setMode('compare')} style={btnStyle(mode === 'compare')}>
              Cross-Sheet Match
            </button>
            <button onClick={() => setMode('multikey')} style={btnStyle(mode === 'multikey')}>
              🔑 Multi-Key Match
            </button>
          </div>

          {error && <div style={{ color: 'red' }}>{error}</div>}

          {mode === 'abbrev' && (
            <>
              {!selectedSheet && <SheetSelector sheets={sheets} onSelect={handleSheetSelect} />}
              {selectedSheet && (
                <ColumnSelector
                  columns={columns}
                  selectedColumn={selectedColumn}
                  onSelect={setSelectedColumn}
                />
              )}
            </>
          )}

          {mode === 'compare' && (
            <ColumnComparer uploadId={uploadId} sheets={sheets} />
          )}

          {mode === 'multikey' && (
            <MultiKeyComparer uploadId={uploadId} sheets={sheets} />
          )}
        </>
      )}
    </div>
  );
}

export default App;