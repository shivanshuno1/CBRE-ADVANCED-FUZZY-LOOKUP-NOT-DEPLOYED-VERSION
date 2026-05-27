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
  { short: 'SDE', full: 'Software Developer Engineer' },
  { short: 'INC', full: 'International Corporations' },
  { short: 'LTD', full: 'Limited' },
  { short: 'CORP', full: 'Corporation' },
  { short: 'LLC', full: 'Limited Liability Company' },
  { short: 'CEO', full: 'Chief Executive Officer' },
  { short: 'CTO', full: 'Chief Technology Officer' },
  { short: 'CFO', full: 'Chief Financial Officer' },
  { short: 'HR', full: 'Human Resources' },
  { short: 'MGR', full: 'Manager' },
  { short: 'ASAP', full: 'As Soon As Possible' },
  { short: 'EOD', full: 'End of Day' },
  { short: 'ETA', full: 'Estimated Time of Arrival' },
  { short: 'FAQ', full: 'Frequently Asked Questions' },
  { short: 'GUI', full: 'Graphical User Interface' },
  { short: 'API', full: 'Application Programming Interface' },
  { short: 'DB', full: 'Database' },
  { short: 'UI', full: 'User Interface' },
  { short: 'UX', full: 'User Experience' },
  { short: 'QA', full: 'Quality Assurance' },
  { short: 'LLP', full: 'Limited Liability Partnership' },
  { short: 'PVT LTD', full: 'Private Limited' },
  { short: 'SAS', full: 'Sociedad por Acciones Simplificada' }
];

// ---------- Helper: Expand abbreviations in a text ----------
function expandAbbreviationsInText(text, dictionary) {
  if (!text) return text;
  let expanded = text;
  // Sort by longest abbreviation first to avoid partial replacements
  const sortedDict = [...dictionary].sort((a, b) => b.short.length - a.short.length);
  for (const entry of sortedDict) {
    const regex = new RegExp(`\\b${entry.short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    expanded = expanded.replace(regex, entry.full);
  }
  return expanded;
}

// ---------- Existing endpoints ----------

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

// ---------- NEW: Enhanced fuzzy column comparison with abbreviation expansion ----------
app.post('/api/fuzzy-compare-enhanced', (req, res) => {
  try {
    const {
      uploadId,
      sheetName,
      columnLeft,
      columnRight,
      customMappings = [],
      threshold = 60,
      expandLeft = true,
      expandRight = true
    } = req.body;

    const upload = uploads.get(uploadId);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });

    const worksheet = upload.workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (rawData.length < 2) return res.status(400).json({ error: 'No data rows' });

    const headers = rawData[0].map(h => String(h || ''));
    const leftIdx = headers.findIndex(h => h === columnLeft);
    const rightIdx = headers.findIndex(h => h === columnRight);
    if (leftIdx === -1 || rightIdx === -1) {
      return res.status(400).json({ error: 'One or both columns not found' });
    }

    const dictionary = [...DEFAULT_DICTIONARY, ...customMappings];
    const results = [];

    for (let i = 1; i < rawData.length; i++) {
      let leftVal = rawData[i][leftIdx] ? String(rawData[i][leftIdx]).trim() : '';
      let rightVal = rawData[i][rightIdx] ? String(rawData[i][rightIdx]).trim() : '';

      if (expandLeft && leftVal) leftVal = expandAbbreviationsInText(leftVal, dictionary);
      if (expandRight && rightVal) rightVal = expandAbbreviationsInText(rightVal, dictionary);

      let score = 0;
      if (leftVal && rightVal) {
        score = fuzzball.token_set_ratio(leftVal, rightVal);
      }

      results.push({
        rowIndex: i,
        originalLeft: rawData[i][leftIdx] ? String(rawData[i][leftIdx]).trim() : '',
        originalRight: rawData[i][rightIdx] ? String(rawData[i][rightIdx]).trim() : '',
        expandedLeft: leftVal,
        expandedRight: rightVal,
        similarityScore: Math.round(score),
        isMatch: score >= threshold
      });
    }

    // Build output Excel with additional columns
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
    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);
    const workbookBuffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });
    const processId = uuidv4();
    processes.set(processId, { workbookBuffer, filename: `fuzzy_compare_enhanced_${Date.now()}.xlsx` });
    setTimeout(() => processes.delete(processId), 3600000);

    const previewResults = results.slice(0, 100);
    res.json({
      processId,
      preview: previewResults,
      totalRows: results.length,
      matchedCount: results.filter(r => r.isMatch).length
    });
  } catch (error) {
    console.error('Enhanced fuzzy compare error:', error);
    res.status(500).json({ error: 'Failed to compare columns' });
  }
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));