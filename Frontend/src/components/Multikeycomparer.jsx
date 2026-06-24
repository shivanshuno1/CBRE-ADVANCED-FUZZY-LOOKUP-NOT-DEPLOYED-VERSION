import React, { useState, useEffect } from 'react';
import axios from 'axios';

const MATCH_TYPES = [
  { value: 'fuzzy', label: 'Fuzzy', desc: 'Approximate text match (names, addresses)' },
  { value: 'exact', label: 'Exact', desc: 'Must match exactly — mismatches reject the pair' },
  { value: 'id',    label: 'ID / Hard Filter', desc: 'Exact match on a unique identifier — mismatches block the pair' },
];

const DEFAULT_KEY = { leftCol: '', rightCol: '', weight: 1, matchType: 'fuzzy' };

// Defined OUTSIDE the component so it is never stale or affected by closure issues
function safeColOptions(cols, side) {
  if (!cols || !Array.isArray(cols)) return null;
  return cols
    .filter(function(c) { return c !== null && c !== undefined && typeof c === 'object' && c.name !== null && c.name !== undefined; })
    .map(function(c) {
      return React.createElement('option', { key: side + '-' + c.name, value: c.name }, c.name);
    });
}

const MultiKeyComparer = ({ uploadId, sheets }) => {
  const [leftSheet, setLeftSheet]       = useState('');
  const [rightSheet, setRightSheet]     = useState('');
  const [leftCols, setLeftCols]         = useState([]);
  const [rightCols, setRightCols]       = useState([]);
  const [matchKeys, setMatchKeys]       = useState([{ ...DEFAULT_KEY }]);
  const [threshold, setThreshold]       = useState(60);
  const [loading, setLoading]           = useState(false);
  const [results, setResults]           = useState(null);
  const [error, setError]               = useState('');
  const [expandedRow, setExpandedRow]   = useState(null);

  useEffect(() => {
    if (!leftSheet) { setLeftCols([]); return; }
    axios.get('http://localhost:5000/api/columns/' + uploadId + '/' + encodeURIComponent(leftSheet))
      .then(function(r) {
        const cols = Array.isArray(r.data && r.data.columns) ? r.data.columns : [];
        setLeftCols(cols.filter(function(c) { return c !== null && c !== undefined; }));
      })
      .catch(function() { setError('Failed to load left sheet columns'); });
  }, [leftSheet, uploadId]);

  useEffect(() => {
    if (!rightSheet) { setRightCols([]); return; }
    axios.get('http://localhost:5000/api/columns/' + uploadId + '/' + encodeURIComponent(rightSheet))
      .then(function(r) {
        const cols = Array.isArray(r.data && r.data.columns) ? r.data.columns : [];
        setRightCols(cols.filter(function(c) { return c !== null && c !== undefined; }));
      })
      .catch(function() { setError('Failed to load right sheet columns'); });
  }, [rightSheet, uploadId]);

  const updateKey = (idx, field, value) =>
    setMatchKeys(prev => prev.map((k, i) => i === idx ? { ...k, [field]: value } : k));

  const addKey = () => setMatchKeys(prev => [...prev, { ...DEFAULT_KEY }]);
  const removeKey = (idx) => setMatchKeys(prev => prev.filter((_, i) => i !== idx));

  const isReady = () =>
    leftSheet && rightSheet &&
    matchKeys.length > 0 &&
    matchKeys.every(k => k.leftCol && k.rightCol);

  const runMatch = async () => {
    if (!isReady()) { setError('Please fill in all key columns'); return; }
    setLoading(true); setError(''); setResults(null); setExpandedRow(null);
    try {
      const res = await axios.post('http://localhost:5000/api/multi-key-match-preview', {
        sheetLeft: leftSheet, sheetRight: rightSheet, matchKeys, threshold
      });
      setResults(res.data);
    } catch (err) {
      setError((err.response && err.response.data && err.response.data.error) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = async () => {
    try {
      const res = await axios.post('http://localhost:5000/api/multi-key-match-download', {
        sheetLeft: leftSheet, sheetRight: rightSheet, matchKeys, threshold
      }, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'multi_key_result.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Download failed: ' + err.message);
    }
  };

  const safeSheets = Array.isArray(sheets) ? sheets : [];

  const scoreColor = (score) => {
    if (score >= 90) return '#16a34a';
    if (score >= 70) return '#ca8a04';
    return '#dc2626';
  };

  const matchTypeBadge = (type) => {
    const colors = { fuzzy: '#3b82f6', exact: '#8b5cf6', id: '#ef4444' };
    return (
      <span style={{
        fontSize: 10, padding: '1px 6px', borderRadius: 10,
        background: colors[type] || '#888', color: '#fff', fontWeight: 600
      }}>{type.toUpperCase()}</span>
    );
  };

  const sel = { padding: '6px 8px', borderRadius: 5, border: '1px solid #d1d5db', width: '100%' };

  return (
    <div style={{ border: '1px solid #ccc', padding: 24, marginTop: 20, borderRadius: 8 }}>
      <h2 style={{ margin: '0 0 6px' }}>Multi-Key Match</h2>
      <p style={{ color: '#555', fontSize: 13, margin: '0 0 20px' }}>
        Match rows using <strong>multiple columns at once</strong>. Use <em>ID / Hard Filter</em> to
        prevent false positives — "Dev from Gurgaon" and "Dev from Agra" won't merge if city or ID differs.
      </p>

      {error && (
        <div style={{ color: '#dc2626', background: '#fef2f2', border: '1px solid #fca5a5',
          padding: 10, borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Sheet Selectors */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Left Sheet</label>
          <select value={leftSheet} onChange={e => setLeftSheet(e.target.value)} style={sel}>
            <option value="">Select a sheet</option>
            {safeSheets.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Right Sheet</label>
          <select value={rightSheet} onChange={e => setRightSheet(e.target.value)} style={sel}>
            <option value="">Select a sheet</option>
            {safeSheets.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* Match Keys */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontWeight: 700, fontSize: 15 }}>Match Keys</label>
          <button onClick={addKey} style={{
            padding: '4px 12px', background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13
          }}>+ Add Key</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px 140px 32px',
          gap: 8, padding: '4px 0', fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
          <span>Left Column</span><span>Right Column</span>
          <span>Weight</span><span>Match Type</span><span></span>
        </div>

        {matchKeys.map((key, idx) => (
          <div key={idx} style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 90px 140px 32px',
            gap: 8, marginBottom: 8, alignItems: 'center',
            background: idx % 2 === 0 ? '#f9fafb' : '#fff',
            padding: 8, borderRadius: 6, border: '1px solid #e5e7eb'
          }}>
            <select value={key.leftCol} onChange={e => updateKey(idx, 'leftCol', e.target.value)}
              style={sel} disabled={!leftCols.length}>
              <option value="">Select column</option>
              {safeColOptions(leftCols, 'lk' + idx)}
            </select>

            <select value={key.rightCol} onChange={e => updateKey(idx, 'rightCol', e.target.value)}
              style={sel} disabled={!rightCols.length}>
              <option value="">Select column</option>
              {safeColOptions(rightCols, 'rk' + idx)}
            </select>

            <input type="number" min="1" max="10" value={key.weight}
              onChange={e => updateKey(idx, 'weight', parseFloat(e.target.value) || 1)}
              style={sel} />

            <select value={key.matchType} onChange={e => updateKey(idx, 'matchType', e.target.value)}
              style={{ ...sel,
                borderLeft: key.matchType === 'id' ? '3px solid #ef4444'
                  : key.matchType === 'exact' ? '3px solid #8b5cf6' : '3px solid #3b82f6' }}>
              {MATCH_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>

            {matchKeys.length > 1 ? (
              <button onClick={() => removeKey(idx)} style={{
                background: '#fee2e2', border: 'none', borderRadius: 5, color: '#dc2626',
                cursor: 'pointer', fontWeight: 700, fontSize: 16,
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>x</button>
            ) : <span />}
          </div>
        ))}

        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6b7280', marginTop: 6, flexWrap: 'wrap' }}>
          {MATCH_TYPES.map(t => (
            <span key={t.value}>{matchTypeBadge(t.value)} {t.desc}</span>
          ))}
        </div>
      </div>

      {/* Threshold */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
          Composite Score Threshold: {threshold}%
        </label>
        <input type="range" min="0" max="100" value={threshold}
          onChange={e => setThreshold(parseInt(e.target.value))} style={{ width: '100%' }} />
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
          A pair must score at least this much across all keys to be considered a match.
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={runMatch} disabled={loading || !isReady()} style={{
          padding: '9px 20px',
          background: loading || !isReady() ? '#93c5fd' : '#2563eb',
          color: '#fff', border: 'none', borderRadius: 6,
          cursor: loading || !isReady() ? 'not-allowed' : 'pointer',
          fontWeight: 600, fontSize: 14
        }}>
          {loading ? 'Matching...' : 'Run Multi-Key Match'}
        </button>

        {results && results.matched && results.matched.length > 0 && (
          <button onClick={downloadExcel} style={{
            padding: '9px 20px', background: '#16a34a', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 14
          }}>
            Download Excel
          </button>
        )}
      </div>

      {/* Results */}
      {results && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              ['Matched',         results.matchedCount,       '#16a34a', '#f0fdf4'],
              ['Unmatched Left',  results.unmatchedLeftCount,  '#dc2626', '#fef2f2'],
              ['Unmatched Right', results.unmatchedRightCount, '#ca8a04', '#fefce8'],
              ['Total Left',      results.totalLeft,           '#2563eb', '#eff6ff'],
              ['Total Right',     results.totalRight,          '#7c3aed', '#f5f3ff'],
            ].map(function(item) {
              const label = item[0], val = item[1], color = item[2], bg = item[3];
              return (
                <div key={label} style={{
                  background: bg, border: '1px solid ' + color + '30',
                  borderRadius: 8, padding: '8px 14px', textAlign: 'center', minWidth: 90
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: color }}>{val}</div>
                  <div style={{ fontSize: 11, color: '#374151' }}>{label}</div>
                </div>
              );
            })}
          </div>

          {results.matched.length === 0 && (
            <div style={{ color: '#6b7280', padding: 16, background: '#f9fafb',
              borderRadius: 8, textAlign: 'center' }}>
              No matches found — try lowering the threshold or checking your column selections.
            </div>
          )}

          {results.matched.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                Click a row to expand per-key score breakdown. Showing first 20 of {results.matched.length}.
              </p>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    <th style={thStyle}>#</th>
                    {matchKeys.map((k, i) => (
                      <React.Fragment key={i}>
                        <th style={thStyle}>L: {k.leftCol}</th>
                        <th style={thStyle}>R: {k.rightCol}</th>
                      </React.Fragment>
                    ))}
                    <th style={{ ...thStyle, textAlign: 'center' }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {results.matched.slice(0, 20).map((m, idx) => (
                    <React.Fragment key={idx}>
                      <tr
                        onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                        style={{ cursor: 'pointer',
                          background: expandedRow === idx ? '#eff6ff' : idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                        <td style={tdStyle}>{idx + 1}</td>
                        {matchKeys.map((k, ki) => (
                          <React.Fragment key={ki}>
                            <td style={tdStyle}>{m.left && m.left[k.leftCol] !== undefined ? m.left[k.leftCol] : '—'}</td>
                            <td style={tdStyle}>{m.right && m.right[k.rightCol] !== undefined ? m.right[k.rightCol] : '—'}</td>
                          </React.Fragment>
                        ))}
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: scoreColor(m.compositeScore) }}>
                          {m.compositeScore}%
                        </td>
                      </tr>

                      {expandedRow === idx && (
                        <tr>
                          <td colSpan={matchKeys.length * 2 + 2}
                            style={{ padding: '8px 16px', background: '#eff6ff', borderBottom: '2px solid #bfdbfe' }}>
                            <strong style={{ fontSize: 12 }}>Key-by-Key Breakdown:</strong>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                              {(m.keyBreakdown || []).map((kb, ki) => (
                                <div key={ki} style={{
                                  background: '#fff', border: '1px solid #e5e7eb',
                                  borderRadius: 6, padding: '6px 10px', fontSize: 12, minWidth: 160
                                }}>
                                  <div style={{ marginBottom: 3 }}>
                                    {matchTypeBadge(kb.matchType)}
                                    <strong style={{ marginLeft: 4 }}>{kb.leftCol}</strong>
                                  </div>
                                  <div style={{ color: '#374151' }}>
                                    <span style={{ color: '#2563eb' }}>{kb.leftVal || '—'}</span>
                                    {' vs '}
                                    <span style={{ color: '#7c3aed' }}>{kb.rightVal || '—'}</span>
                                  </div>
                                  <div style={{ marginTop: 4, fontWeight: 700, color: scoreColor(kb.score) }}>
                                    {kb.score}%
                                    {kb.score === 0 && (kb.matchType === 'id' || kb.matchType === 'exact') ? ' (blocked)' : ''}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              {results.matched.length > 20 && (
                <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 12, marginTop: 8 }}>
                  ... and {results.matched.length - 20} more rows — download Excel to see all.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const thStyle = {
  border: '1px solid #e5e7eb', padding: '8px 10px',
  textAlign: 'left', fontWeight: 600, fontSize: 12, color: '#374151'
};
const tdStyle = { border: '1px solid #e5e7eb', padding: '7px 10px', fontSize: 12 };

export default MultiKeyComparer;