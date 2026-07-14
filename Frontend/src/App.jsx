import React, { useState } from 'react';
import FileUploader from './components/FileUploader';
import SheetSelector from './components/SheetSelector';
import ColumnSelector from './components/ColumnSelector';
import ColumnComparer from './components/ColumnComparer';
import MultiKeyComparer from './components/MultiKeyComparer';
import axios from 'axios';
import './App.css';

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

  const btnClass = (active) => `btn ${active ? 'active' : ''}`;

  return (
    <div className="app">
      <div className="header">
        <h1 className="title">Excel Fuzzy Lookup</h1>
        <div className="subtitle">Smart, fast fuzzy matching for Excel sheets</div>
      </div>

      {!uploadId ? (
        <div className="card spaced">
          <FileUploader onUploadSuccess={handleUploadSuccess} onError={setError} />
        </div>
      ) : (
        <>
          <div className="card">
            <div className="mode-row">
              <button onClick={() => setMode('abbrev')} className={btnClass(mode === 'abbrev')}>
                Abbreviation Mode
              </button>
              <button onClick={() => setMode('compare')} className={btnClass(mode === 'compare')}>
                Cross-Sheet Match
              </button>
              <button onClick={() => setMode('multikey')} className={btnClass(mode === 'multikey')}>
                🔑 Multi-Key Match
              </button>
            </div>

            {error && <div className="error">{error}</div>}

            <div className="layout">
              <div className="panel">
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
              </div>

              <div className="panel">
                <div className="card">
                  <div className="muted">Preview & Tips</div>
                  <div style={{marginTop:8,fontSize:13}}>Choose a mode and pick a sheet/column to begin. Results will appear here.</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;