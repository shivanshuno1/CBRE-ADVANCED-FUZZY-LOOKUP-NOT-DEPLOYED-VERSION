import React, { useState } from 'react';
import axios from 'axios';

const FileUploader = ({ onUploadSuccess, onError }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return onError('Select a file');
    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    try {
      const res = await axios.post('http://localhost:5000/api/upload', fd);
      onUploadSuccess(res.data);
    } catch (err) {
      onError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="uploader">
      <h2>Upload Excel</h2>
      <div className="dropzone">
        <label className="upload-box">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={e => setFile(e.target.files[0])}
            style={{ display: 'none' }}
          />
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3v10" stroke="#8EA7FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 7l4-4 4 4" stroke="#8EA7FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#8EA7FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>Drag & drop or click to select</div>
          <div className="muted">Supported: .xlsx, .xls (Max 10MB)</div>
          {file && <div className="filename">Selected: {file.name}</div>}
        </label>
      </div>

      <div className="actions" style={{marginTop:12}}>
        <button className={`btn ${uploading ? '' : 'active'}`} onClick={handleUpload} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </div>
  );
};

export default FileUploader;