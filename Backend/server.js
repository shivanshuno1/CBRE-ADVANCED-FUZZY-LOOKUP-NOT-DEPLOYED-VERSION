import express from 'express';
import cors from 'cors';
import multer from 'multer';
import XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { matchAbbreviation, detectPotentialAbbreviations } from './utils/matcher.js';
import * as fuzzball from 'fuzzball';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Storage
const uploads = new Map();
const processes = new Map();

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Default dictionary of abbreviations
const DEFAULT_DICTIONARY = [
  { short: 'SDE',     full: 'Software Developer Engineer' },
  { short: 'INC',     full: 'Incorporated' },
  { short: 'LTD',     full: 'Limited' },
  { short: 'CORP',    full: 'Corporation' },
  { short: 'LLC',     full: 'Limited Liability Company' },
  { short: 'CEO',     full: 'Chief Executive Officer' },
  { short: 'CTO',     full: 'Chief Technology Officer' },
  { short: 'CFO',     full: 'Chief Financial Officer' },
  { short: 'HR',      full: 'Human Resources' },
  { short: 'MGR',     full: 'Manager' },
  { short: 'ASAP',    full: 'As Soon As Possible' },
  { short: 'EOD',     full: 'End of Day' },
  { short: 'ETA',     full: 'Estimated Time of Arrival' },
  { short: 'FAQ',     full: 'Frequently Asked Questions' },
  { short: 'GUI',     full: 'Graphical User Interface' },
  { short: 'API',     full: 'Application Programming Interface' },
  { short: 'DB',      full: 'Database' },
  { short: 'UI',      full: 'User Interface' },
  { short: 'UX',      full: 'User Experience' },
  { short: 'QA',      full: 'Quality Assurance' },
  { short: 'LLP',     full: 'Limited Liability Partnership' },
  { short: 'PVT LTD', full: 'Private Limited' },
  { short: 'PVT',     full: 'Private' },
  { short: 'SAS',     full: 'Sociedad por Acciones Simplificada' },
  { short: 'AG',      full: 'Aktiengesellschaft' },
  { short: 'SA',      full: 'Société Anonyme' },
  { short: 'NV',      full: 'Naamloze Vennootschap' },
  { short: 'BV',      full: 'Besloten Vennootschap' },
  { short: 'GMBH',    full: 'Gesellschaft mit beschränkter Haftung' },
  { short: 'SRL',     full: 'Sociedad de Responsabilidad Limitada' },
  { short: 'PTY',     full: 'Proprietary' },
  { short: 'INTL',    full: 'International' },
  { short: 'MGMT',    full: 'Management' },
  { short: 'SVCS',    full: 'Services' },
  { short: 'ASSOC',   full: 'Associates' },
  { short: 'ENGG',    full: 'Engineering' },
  { short: 'INFRA',   full: 'Infrastructure' },
  { short: 'FINL',    full: 'Financial' },
  { short: 'R&D',      full: 'Research and Development' },
  {short:'TECH',    full: 'Technology' },
  {short:'CONSULT', full: 'Consulting' },
  {short: 'Chase & Co.', full: 'Chase and Company' },
  {short: 'Corp',   full: 'Corporation' },
  {short: 'Co',     full: 'Company' },
  {short: 'Inc',    full: 'Incorporated' },
  {short: 'Ltd',    full: 'Limited' },
  {short: 'ACC',   full: 'Associated Cement Companies' },
  {short: 'BASF',  full: 'Badische Anilin- und Soda-Fabrik' },
  {short: 'HP',    full: 'Hewlett-Packard' },
  {short: 'IBM',   full: 'International Business Machines' },
  {short: 'KPMG',  full: 'Klynveld Peat Marwick Goerdeler' },
  {short: 'P&G',   full: 'Procter & Gamble' },
  {short: 'PwC',   full: 'PricewaterhouseCoopers' },
  {short: '3M',    full: 'Minnesota Mining and Manufacturing' },
  {short: 'GE',    full: 'General Electric' },
  {short: 'L & T', full: 'Larsen & Toubro' },
  {short: 'J&J',   full: 'Johnson & Johnson' },
  {short: 'AT&T',  full: 'American Telephone and Telegraph' },
  {short: 'Boeing', full: 'The Boeing Company' },
  {short: 'Coca-Cola', full: 'The Coca-Cola Company' },
  {short: 'Disney', full: 'The Walt Disney Company' },
  {short: 'Ford',   full: 'Ford Motor Company' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper 1: Strip dots from acronym notation BEFORE dictionary expansion.
//
// Problem: The dictionary stores "AG", "SAS", "LLP" etc. as plain strings, but
// real-world data often writes them as "A.G.", "S.A.S.", "L.L.P." — with dots
// between every letter. The `\b` word-boundary anchor in the expansion regex
// does NOT fire around a letter that is immediately followed by a dot, so
// "A.G." is invisible to `\bAG\b` and the entry is never expanded.
//
// Fix: Collapse dotted single-letter sequences into plain acronyms first.
//   "S.A.S."  →  "SAS"
//   "L.L.P."  →  "LLP"
//   "A.G."    →  "AG"
//   "T.C.S."  →  "TCS"
// ─────────────────────────────────────────────────────────────────────────────
function preprocessAcronyms(text) {
  if (!text) return text;
  return text
    // 4-letter dotted: A.B.C.D.
    .replace(/\b([A-Za-z])\.([A-Za-z])\.([A-Za-z])\.([A-Za-z])\./g, '$1$2$3$4')
    // 3-letter dotted with trailing dot: A.B.C.
    .replace(/\b([A-Za-z])\.([A-Za-z])\.([A-Za-z])\./g, '$1$2$3')
    // 3-letter dotted no trailing dot: A.B.C
    .replace(/\b([A-Za-z])\.([A-Za-z])\.([A-Za-z])\b/g, '$1$2$3')
    // 2-letter dotted with trailing dot: A.B.
    .replace(/\b([A-Za-z])\.([A-Za-z])\./g, '$1$2')
    // 2-letter dotted no trailing dot: A.B
    .replace(/\b([A-Za-z])\.([A-Za-z])\b/g, '$1$2');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper 2: Expand abbreviations in a text using the dictionary.
//
// Runs preprocessAcronyms first so dotted forms ("A.G.", "S.A.S.") are
// normalised to plain acronyms before the regex dictionary lookup fires.
// ─────────────────────────────────────────────────────────────────────────────
function expandAbbreviationsInText(text, dictionary) {
  if (!text) return text;
  let expanded = preprocessAcronyms(text);
  const sortedDict = [...dictionary].sort((a, b) => b.short.length - a.short.length);
  for (const entry of sortedDict) {
    const regex = new RegExp(`\\b${entry.short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    expanded = expanded.replace(regex, entry.full);
  }
  return expanded;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper 3: Exact-expansion-match guard.
//
// After both sides are fully expanded, if they are identical (case-insensitive,
// trimmed), it means the abbreviation on the left IS definitively the same
// entity as the expanded form on the right — score must be 100, no fuzzball
// needed. This is the explicit check the user requested:
//   "if the abbreviation found is the same as the expanded right → score = 100"
//
// Examples that hit this path:
//   "Siemens A.G."  expands to "Siemens Aktiengesellschaft"
//   "Siemens Aktiengesellschaft" stays as-is
//   → both identical → 100
//
//   "Cbre Colombia S.A.S." expands to "Cbre Colombia Sociedad por Acciones Simplificada"
//   right side is already "Cbre Colombia Sociedad por Acciones Simplificada"
//   → both identical → 100
// ─────────────────────────────────────────────────────────────────────────────
function expansionsAreIdentical(expandedLeft, expandedRight) {
  return expandedLeft.trim().toLowerCase() === expandedRight.trim().toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper 4: Normalise prefix-abbreviations before fuzzy scoring.
//
// Handles cases where one token is a legitimate short form of another but
// was NOT in the dictionary, so expansion didn't help:
//   "Tech" vs "Technology" → both become "technology"
//   "Mgmt" vs "Management" → both become "management"  (if not in dict)
//
// Condition: shorter token must be ≥3 chars, must be a prefix of the longer
// token, and must cover ≥40% of it (guards against accidental matches).
// ─────────────────────────────────────────────────────────────────────────────
function normalizeForScoring(left, right) {
  const leftTokens  = left.toLowerCase().split(/\s+/);
  const rightTokens = right.toLowerCase().split(/\s+/);
  const replacements = new Map();

  for (const lt of leftTokens) {
    for (const rt of rightTokens) {
      if (lt === rt) continue;
      const [shorter, longer] = lt.length < rt.length ? [lt, rt] : [rt, lt];
      if (
        shorter.length >= 3 &&
        longer.startsWith(shorter) &&
        shorter.length / longer.length >= 0.4
      ) {
        replacements.set(shorter, longer);
      }
    }
  }

  if (replacements.size === 0) return [left, right];

  const apply = str =>
    str.toLowerCase().split(/\s+/).map(tok => replacements.get(tok) || tok).join(' ');

  return [apply(left), apply(right)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Core scoring function — used by /api/fuzzy-compare-enhanced.
// Pipeline:
//   1. expandAbbreviationsInText (includes preprocessAcronyms inside)
//   2. expansionsAreIdentical  → if yes, return 100 immediately
//   3. normalizeForScoring     → collapse prefix-abbreviation token pairs
//   4. fuzzball.token_set_ratio
// ─────────────────────────────────────────────────────────────────────────────
function computeSimilarityScore(leftVal, rightVal) {
  // Step 2 — exact-expansion guard
  if (expansionsAreIdentical(leftVal, rightVal)) {
    return 100;
  }
  // Step 3 — prefix-abbreviation normalisation
  const [normLeft, normRight] = normalizeForScoring(leftVal, rightVal);
  // Step 4 — fuzzy score
  return Math.round(fuzzball.token_set_ratio(normLeft, normRight));
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────────────────────────────────────────

// Upload Excel file
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const buffer = req.file.buffer;
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheets = workbook.SheetNames.map(name => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }).length
    }));
    const uploadId = uuidv4();
    uploads.set(uploadId, { workbook, sheets: workbook.SheetNames, buffer, originalName: req.file.originalname });
    setTimeout(() => uploads.delete(uploadId), 3600000);
    res.json({ uploadId, sheets, message: 'File uploaded successfully' });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// Get sheet info (columns and preview)
app.post('/api/sheet-info', (req, res) => {
  try {
    const { uploadId, sheetName } = req.body;
    const upload = uploads.get(uploadId);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });
    const worksheet = upload.workbook.Sheets[sheetName];
    if (!worksheet) return res.status(404).json({ error: 'Sheet not found' });
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (data.length === 0) return res.json({ columns: [], preview: [] });
    const headers = data[0].map((h, idx) => ({ name: String(h || `Column_${idx + 1}`), index: idx }));
    const preview = data.slice(1, 6).map(row => {
      const obj = {};
      headers.forEach((header, idx) => { obj[header.name] = row[idx] !== undefined ? String(row[idx]) : ''; });
      return obj;
    });
    res.json({ columns: headers, preview, totalRows: data.length - 1 });
  } catch (error) {
    console.error('Sheet info error:', error);
    res.status(500).json({ error: 'Failed to get sheet info' });
  }
});

// Detect potential abbreviations from a column
app.post('/api/detect-abbreviations', (req, res) => {
  try {
    const { uploadId, sheetName, columnName, sampleSize = 5000 } = req.body;
    const upload = uploads.get(uploadId);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });
    const worksheet = upload.workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (rawData.length < 2) return res.json({ detected: [] });
    const headers = rawData[0].map(h => String(h));
    const colIndex = headers.findIndex(h => h === columnName);
    if (colIndex === -1) return res.status(404).json({ error: 'Column not found' });
    const maxRows = Math.min(sampleSize, rawData.length - 1);
    const columnValues = [];
    for (let i = 1; i <= maxRows; i++) {
      const val = rawData[i][colIndex];
      if (val && typeof val === 'string') columnValues.push(val);
    }
    const detected = detectPotentialAbbreviations(columnValues);
    res.json({ detected, totalSample: columnValues.length });
  } catch (error) {
    console.error('Detection error:', error);
    res.status(500).json({ error: 'Failed to detect abbreviations' });
  }
});

// Process abbreviation lookup (original feature)
app.post('/api/process', (req, res) => {
  try {
    const { uploadId, sheetName, columnName, customMappings = [], threshold = 60 } = req.body;
    const upload = uploads.get(uploadId);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });
    const worksheet = upload.workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (rawData.length < 2) return res.status(400).json({ error: 'Sheet has no data rows' });
    const headers = rawData[0].map(h => String(h || ''));
    const columnIndex = headers.findIndex(h => h === columnName);
    if (columnIndex === -1) return res.status(400).json({ error: `Column "${columnName}" not found` });

    const dictionary = [...DEFAULT_DICTIONARY, ...customMappings];
    const results = [];
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const originalValue = row[columnIndex] ? String(row[columnIndex]).trim() : '';
      let match = null, score = 0;
      if (originalValue) {
        const matchResult = matchAbbreviation(originalValue, dictionary, threshold);
        if (matchResult) { match = matchResult; score = matchResult.score; }
      }
      results.push({
        rowIndex: i,
        originalValue,
        matchedAbbreviation: match ? match.short : '',
        expandedValue: match ? match.full : '',
        matchScore: score,
        originalRow: { ...row }
      });
    }

    const newHeaders = [...headers, 'Matched Abbreviation', 'Expanded Value', 'Match Score'];
    const newData = [newHeaders];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const originalRow = result.originalRow;
      const newRow = [];
      for (let j = 0; j < headers.length; j++) newRow.push(originalRow[j] !== undefined ? originalRow[j] : '');
      newRow.push(result.matchedAbbreviation);
      newRow.push(result.expandedValue);
      newRow.push(result.matchScore);
      newData.push(newRow);
    }
    const newWorksheet = XLSX.utils.aoa_to_sheet(newData);
    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);
    const workbookBuffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });
    const processId = uuidv4();
    processes.set(processId, { workbookBuffer, filename: `fuzzy_lookup_${Date.now()}.xlsx` });
    setTimeout(() => processes.delete(processId), 3600000);

    const previewResults = results.slice(0, 100);
    res.json({
      processId,
      preview: previewResults,
      totalRows: results.length,
      matchedCount: results.filter(r => r.matchScore > 0).length
    });
  } catch (error) {
    console.error('Process error:', error);
    res.status(500).json({ error: 'Failed to process lookup' });
  }
});

// Download processed file
app.get('/api/download/:processId', (req, res) => {
  try {
    const { processId } = req.params;
    const process = processes.get(processId);
    if (!process) return res.status(404).json({ error: 'Processed file not found' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${process.filename}`);
    res.send(process.workbookBuffer);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Enhanced fuzzy column comparison with abbreviation expansion
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/fuzzy-compare-enhanced', (req, res) => {
  try {
    const {
      uploadId,
      sheetName,
      columnLeft,
      columnRight,
      customMappings = [],
      threshold = 60,
      expandLeft  = true,
      expandRight = true
    } = req.body;

    const upload = uploads.get(uploadId);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });

    const worksheet = upload.workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (rawData.length < 2) return res.status(400).json({ error: 'No data rows' });

    const headers = rawData[0].map(h => String(h || ''));
    const leftIdx  = headers.findIndex(h => h === columnLeft);
    const rightIdx = headers.findIndex(h => h === columnRight);
    if (leftIdx === -1 || rightIdx === -1) {
      return res.status(400).json({ error: 'One or both columns not found' });
    }

    const dictionary = [...DEFAULT_DICTIONARY, ...customMappings];
    const results = [];

    for (let i = 1; i < rawData.length; i++) {
      let leftVal  = rawData[i][leftIdx]  ? String(rawData[i][leftIdx]).trim()  : '';
      let rightVal = rawData[i][rightIdx] ? String(rawData[i][rightIdx]).trim() : '';

      // Step 1 — expand abbreviations (preprocessAcronyms runs inside this)
      if (expandLeft  && leftVal)  leftVal  = expandAbbreviationsInText(leftVal,  dictionary);
      if (expandRight && rightVal) rightVal = expandAbbreviationsInText(rightVal, dictionary);

      // Steps 2-4 — exact-match guard → prefix normalisation → fuzzy score
      const score = (leftVal && rightVal) ? computeSimilarityScore(leftVal, rightVal) : 0;

      results.push({
        rowIndex:      i,
        originalLeft:  rawData[i][leftIdx]  ? String(rawData[i][leftIdx]).trim()  : '',
        originalRight: rawData[i][rightIdx] ? String(rawData[i][rightIdx]).trim() : '',
        expandedLeft:  leftVal,
        expandedRight: rightVal,
        similarityScore: score,
        isMatch: score >= threshold
      });
    }

    // Build output Excel
    const newHeaders = [...headers, 'Expanded Left', 'Expanded Right', 'Similarity Score', 'Is Match (>threshold)'];
    const newData = [newHeaders];
    for (let i = 0; i < results.length; i++) {
      const row = rawData[i + 1];
      const newRow = [];
      for (let j = 0; j < headers.length; j++) newRow.push(row[j] !== undefined ? row[j] : '');
      newRow.push(results[i].expandedLeft);
      newRow.push(results[i].expandedRight);
      newRow.push(results[i].similarityScore);
      newRow.push(results[i].isMatch ? 'Yes' : 'No');
      newData.push(newRow);
    }

    const newWorksheet = XLSX.utils.aoa_to_sheet(newData);
    const newWorkbook  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);
    const workbookBuffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });
    const processId = uuidv4();
    processes.set(processId, { workbookBuffer, filename: `fuzzy_compare_enhanced_${Date.now()}.xlsx` });
    setTimeout(() => processes.delete(processId), 3600000);

    res.json({
      processId,
      preview:      results.slice(0, 100),
      totalRows:    results.length,
      matchedCount: results.filter(r => r.isMatch).length
    });
  } catch (error) {
    console.error('Enhanced fuzzy compare error:', error);
    res.status(500).json({ error: 'Failed to compare columns' });
  }
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));