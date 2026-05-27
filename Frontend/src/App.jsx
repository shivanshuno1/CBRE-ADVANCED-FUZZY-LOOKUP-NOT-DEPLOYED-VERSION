import React, { useState } from 'react';
import FileUploader from './components/FileUploader';
import SheetSelector from './components/SheetSelector';
import ColumnSelector from './components/ColumnSelector';
import CustomMappings from './components/CustomMappings';
import ResultsTable from './components/ResultsTable';
import DownloadButton from './components/DownloadButton';
import ColumnComparer from './components/ColumnComparer';      // NEW import
import axios from 'axios';

function App() {
  const [uploadId, setUploadId] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [columns, setColumns] = useState([]);
  const [selectedColumn, setSelectedColumn] = useState('');
  const [threshold, setThreshold] = useState(60);
  const [customMappings, setCustomMappings] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [processId, setProcessId] = useState(null);
  const [error, setError] = useState('');
  
  // NEW: mode state ('abbrev' = abbreviation expansion, 'compare' = two‑column similarity)
  const [mode, setMode] = useState('abbrev');

  const handleUploadSuccess = (data) => {
    setUploadId(data.uploadId);
    setSheets(data.sheets);
    setSelectedSheet('');
    setSelectedColumn('');
    setColumns([]);
    setResults(null);
    setProcessId(null);
    setError('');
  };

  const handleSheetSelect = async (sheetName) => {
    setSelectedSheet(sheetName);
    setSelectedColumn('');
    setResults(null);
    setProcessId(null);
    try {
      const response = await axios.post('/api/sheet-info', { uploadId, sheetName });
      setColumns(response.data.columns);
    } catch (err) {
      setError('Failed to load sheet info: ' + err.message);
    }
  };

  const handleProcess = async () => {
    if (!selectedColumn) {
      setError('Please select a column to process');
      return;
    }
    setProcessing(true);
    setError('');
    try {
      const response = await axios.post('/api/process', {
        uploadId,
        sheetName: selectedSheet,
        columnName: selectedColumn,
        customMappings,
        threshold
      });
      setResults(response.data);
      setProcessId(response.data.processId);
    } catch (err) {
      setError('Processing failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setUploadId(null);
    setSheets([]);
    setSelectedSheet('');
    setColumns([]);
    setSelectedColumn('');
    setResults(null);
    setProcessId(null);
    setError('');
    setCustomMappings([]);
    setThreshold(60);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold">Excel Fuzzy Abbreviation Lookup</h1>
          <p className="text-blue-100 mt-2">Match abbreviations like SDE → Software Developer Engineer using fuzzy matching</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!uploadId ? (
          <FileUploader onUploadSuccess={handleUploadSuccess} onError={setError} />
        ) : (
          <div className="space-y-6">
            {/* Progress indicator (unchanged) */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold">1</div>
                    <span className="ml-2 text-sm">File Uploaded</span>
                  </div>
                  <div className="w-16 h-0.5 bg-gray-300"></div>
                  <div className={`flex items-center ${selectedSheet ? 'text-green-600' : 'text-gray-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${selectedSheet ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>2</div>
                    <span className="ml-2 text-sm">Select Sheet</span>
                  </div>
                  <div className="w-16 h-0.5 bg-gray-300"></div>
                  <div className={`flex items-center ${mode === 'abbrev' && selectedColumn ? 'text-green-600' : 'text-gray-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${mode === 'abbrev' && selectedColumn ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>3</div>
                    <span className="ml-2 text-sm">Select Column / Compare</span>
                  </div>
                  <div className="w-16 h-0.5 bg-gray-300"></div>
                  <div className={`flex items-center ${results ? 'text-green-600' : 'text-gray-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${results ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>4</div>
                    <span className="ml-2 text-sm">Results</span>
                  </div>
                </div>
                <button onClick={handleReset} className="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg transition">Upload New File</button>
              </div>
            </div>

            {/* Sheet Selection (unchanged) */}
            {!selectedSheet && <SheetSelector sheets={sheets} onSelect={handleSheetSelect} />}

            {/* After sheet is selected, show mode toggle and appropriate UI */}
            {selectedSheet && !results && (
              <div className="space-y-6">
                {/* NEW: Mode Toggle Buttons */}
                <div className="bg-white rounded-lg shadow-md p-4 flex gap-4">
                  <button
                    onClick={() => setMode('abbrev')}
                    className={`px-4 py-2 rounded-lg font-medium transition ${
                      mode === 'abbrev'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    📝 Abbreviation Expansion Mode
                  </button>
                  <button
                    onClick={() => setMode('compare')}
                    className={`px-4 py-2 rounded-lg font-medium transition ${
                      mode === 'compare'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    🔗 Column Similarity Mode
                  </button>
                </div>

                {/* Abbreviation Mode (your existing UI) */}
                {mode === 'abbrev' && (
                  <>
                    <ColumnSelector
                      columns={columns}
                      selectedColumn={selectedColumn}
                      onSelect={setSelectedColumn}
                    />
                    <CustomMappings
                      mappings={customMappings}
                      onChange={setCustomMappings}
                    />
                    <div className="bg-white rounded-lg shadow-md p-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Fuzzy Matching Threshold ({threshold}%)
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={threshold}
                        onChange={(e) => setThreshold(parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        Lower threshold = more matches but less accurate
                      </p>
                    </div>
                    <div className="flex justify-center">
                      <button
                        onClick={handleProcess}
                        disabled={processing || !selectedColumn}
                        className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
                      >
                        {processing ? (
                          <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Processing...
                          </span>
                        ) : (
                          'Run Fuzzy Lookup'
                        )}
                      </button>
                    </div>
                  </>
                )}

                {/* NEW: Column Similarity Mode */}
                {mode === 'compare' && (
                  <ColumnComparer
                    uploadId={uploadId}
                    sheetName={selectedSheet}
                    columns={columns}
                    customMappings={customMappings}
                  />
                )}
              </div>
            )}

            {/* Results display (unchanged) */}
            {results && (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-green-800 font-semibold">Processing Complete!</p>
                      <p className="text-green-600 text-sm">Matched {results.matchedCount} out of {results.totalRows} rows</p>
                    </div>
                    <DownloadButton processId={processId} />
                  </div>
                </div>
                <ResultsTable results={results.preview} totalRows={results.totalRows} />
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">{error}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;