import express from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import fs from 'fs';
import * as fuzzball from 'fuzzball';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: 'uploads/' });

let workbook = null;

function expandAbbr(s) {
  const map = {
    pvt: 'private', ltd: 'limited', corp: 'corporation',
    inc: 'incorporated', co: 'company', llc: 'limited liability company'
  };
  return s.toLowerCase().replace(/\b(\w+)\b/g, w => map[w] || w);
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const s1 = expandAbbr(String(a));
  const s2 = expandAbbr(String(b));
  if (s1 === s2) return 100;
  return fuzzball.token_set_ratio(s1, s2);
}

// Helper: build prefix index (first 3 letters)
function buildIndex(data, column) {
  const index = new Map();
  for (let i = 0; i < data.length; i++) {
    const val = data[i][column] ? String(data[i][column]).toLowerCase() : '';
    if (val.length >= 3) {
      const prefix = val.substring(0, 3);
      if (!index.has(prefix)) index.set(prefix, []);
      index.get(prefix).push(i);
    }
  }
  return index;
}

// -------------------------------------------------------------------
// Multi-key scoring engine (new)
// matchKeys: [{ leftCol, rightCol, weight, matchType }]
// matchType: 'fuzzy' | 'exact' | 'id'
// 'exact' and 'id' are hard filters — mismatch = score 0 (pair rejected)
// -------------------------------------------------------------------
function exactMatch(a, b) {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function computeCompositeScore(leftRow, rightRow, matchKeys) {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const key of matchKeys) {
    const lv = leftRow[key.leftCol] !== undefined ? String(leftRow[key.leftCol]) : '';
    const rv = rightRow[key.rightCol] !== undefined ? String(rightRow[key.rightCol]) : '';

    if (key.matchType === 'id' || key.matchType === 'exact') {
      if (lv && rv) {
        if (!exactMatch(lv, rv)) return 0; // hard reject
        weightedSum += key.weight * 100;
      } else {
        weightedSum += key.weight * 50; // one side empty — neutral
      }
    } else {
      weightedSum += key.weight * similarity(lv, rv);
    }
    totalWeight += key.weight;
  }

  return totalWeight === 0 ? 0 : Math.round(weightedSum / totalWeight);
}

// -------------------------------------------------------------------
// Original endpoints — unchanged
// -------------------------------------------------------------------
app.post('/api/upload', upload.single('file'), (req, res) => {
  const wb = XLSX.readFile(req.file.path);
  workbook = wb;
  const sheets = wb.SheetNames.map(name => ({ name }));
  res.json({ success: true, uploadId: req.file.filename, sheets });
  fs.unlinkSync(req.file.path);
});

app.get('/api/columns/:uploadId/:sheetName', (req, res) => {
  if (!workbook) return res.status(404).json({ error: 'No workbook' });
  const sheet = workbook.Sheets[req.params.sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  if (!data.length) return res.json({ columns: [] });
  const headers = data[0].map(h => String(h));
  const columns = headers.map((name, idx) => ({ name, index: idx }));
  res.json({ columns });
});

app.post('/api/fuzzy-match-preview', async (req, res) => {
  const { sheetLeft, sheetRight, columnLeft, columnRight, threshold } = req.body;
  const startTime = Date.now();
  try {
    const leftSheet = workbook.Sheets[sheetLeft];
    const rightSheet = workbook.Sheets[sheetRight];
    let leftData = XLSX.utils.sheet_to_json(leftSheet);
    let rightData = XLSX.utils.sheet_to_json(rightSheet);
    
    console.log(`Matching ${leftData.length} left rows against ${rightData.length} right rows...`);
    
    const rightIndex = buildIndex(rightData, columnRight);
    
    const matched = [];
    const usedRight = new Set();
    let comparisons = 0;
    
    for (let li = 0; li < leftData.length; li++) {
      const leftRow = leftData[li];
      const leftVal = leftRow[columnLeft] ? String(leftRow[columnLeft]) : '';
      const leftPrefix = leftVal.length >= 3 ? leftVal.substring(0, 3).toLowerCase() : '';
      
      let candidates = [];
      if (rightIndex.has(leftPrefix)) {
        candidates = rightIndex.get(leftPrefix);
      } else {
        candidates = Array.from({ length: Math.min(1000, rightData.length) }, (_, i) => i);
      }
      
      let bestScore = 0;
      let bestIdx = -1;
      for (const ri of candidates) {
        if (usedRight.has(ri)) continue;
        const rightVal = rightData[ri][columnRight] ? String(rightData[ri][columnRight]) : '';
        const score = similarity(leftVal, rightVal);
        comparisons++;
        if (score > bestScore && score >= threshold) {
          bestScore = score;
          bestIdx = ri;
        }
      }
      if (bestIdx !== -1) {
        matched.push({ left: leftRow, right: rightData[bestIdx], similarity: bestScore });
        usedRight.add(bestIdx);
      }
      
      if ((li + 1) % 1000 === 0) {
        console.log(`Processed ${li + 1}/${leftData.length} rows (${comparisons} comparisons, ${Date.now() - startTime}ms)`);
      }
    }
    
    console.log(`Total comparisons: ${comparisons}, time: ${Date.now() - startTime}ms`);
    res.json({ matched, matchedCount: matched.length, totalLeft: leftData.length, totalRight: rightData.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fuzzy-compare-cross-sheet', (req, res) => {
  const { sheetLeft, sheetRight, columnLeft, columnRight, threshold } = req.body;
  const leftSheet = workbook.Sheets[sheetLeft];
  const rightSheet = workbook.Sheets[sheetRight];
  let leftData = XLSX.utils.sheet_to_json(leftSheet);
  let rightData = XLSX.utils.sheet_to_json(rightSheet);
  const matched = [], unmatchedLeft = [], unmatchedRight = [];
  const usedRight = new Set();
  const rightIndex = buildIndex(rightData, columnRight);
  
  for (const leftRow of leftData) {
    const leftVal = leftRow[columnLeft] ? String(leftRow[columnLeft]) : '';
    const leftPrefix = leftVal.length >= 3 ? leftVal.substring(0, 3).toLowerCase() : '';
    let candidates = rightIndex.get(leftPrefix) || [];
    if (candidates.length === 0) candidates = Array.from({ length: Math.min(1000, rightData.length) }, (_, i) => i);
    
    let bestScore = 0, bestIdx = -1;
    for (const ri of candidates) {
      if (usedRight.has(ri)) continue;
      const rightVal = rightData[ri][columnRight] ? String(rightData[ri][columnRight]) : '';
      const score = similarity(leftVal, rightVal);
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestIdx = ri;
      }
    }
    if (bestIdx !== -1) {
      matched.push({ ...leftRow, ...rightData[bestIdx], _similarityScore: bestScore });
      usedRight.add(bestIdx);
    } else {
      unmatchedLeft.push({ ...leftRow, _matchStatus: 'No match' });
    }
  }
  for (let i = 0; i < rightData.length; i++) {
    if (!usedRight.has(i)) unmatchedRight.push({ ...rightData[i], _matchStatus: 'No match' });
  }
  const wb = XLSX.utils.book_new();
  if (matched.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matched), 'Matched');
  if (unmatchedLeft.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedLeft), 'Unmatched_Left');
  if (unmatchedRight.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedRight), 'Unmatched_Right');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=fuzzy_result.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// -------------------------------------------------------------------
// NEW: Multi-Key Match Preview
// Body: { sheetLeft, sheetRight, matchKeys: [{leftCol, rightCol, weight, matchType}], threshold }
// -------------------------------------------------------------------
app.post('/api/multi-key-match-preview', async (req, res) => {
  const { sheetLeft, sheetRight, matchKeys, threshold } = req.body;
  if (!matchKeys || matchKeys.length === 0)
    return res.status(400).json({ error: 'At least one match key is required' });

  try {
    let leftData  = XLSX.utils.sheet_to_json(workbook.Sheets[sheetLeft]);
    let rightData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetRight]);

    // Use first fuzzy key as primary for prefix index; fall back to first key overall
    const primaryKey = matchKeys.find(k => k.matchType === 'fuzzy') || matchKeys[0];
    const hasIdKey   = matchKeys.some(k => k.matchType === 'id' || k.matchType === 'exact');
    const rightIndex = buildIndex(rightData, primaryKey.rightCol);

    const matched   = [];
    const usedRight = new Set();

    for (const leftRow of leftData) {
      const leftPrimary = leftRow[primaryKey.leftCol] ? String(leftRow[primaryKey.leftCol]) : '';
      const leftPrefix  = leftPrimary.length >= 3 ? leftPrimary.substring(0, 3).toLowerCase() : '';

      // If there's an id/exact key, search all rows (id values may not share a name prefix)
      let candidates = hasIdKey
        ? Array.from({ length: rightData.length }, (_, i) => i)
        : (rightIndex.get(leftPrefix) || Array.from({ length: Math.min(1000, rightData.length) }, (_, i) => i));

      let bestScore = 0, bestIdx = -1;
      for (const ri of candidates) {
        if (usedRight.has(ri)) continue;
        const score = computeCompositeScore(leftRow, rightData[ri], matchKeys);
        if (score > bestScore && score >= threshold) {
          bestScore = score;
          bestIdx   = ri;
        }
      }

      if (bestIdx !== -1) {
        const keyBreakdown = matchKeys.map(key => {
          const lv = leftRow[key.leftCol]           !== undefined ? String(leftRow[key.leftCol])           : '';
          const rv = rightData[bestIdx][key.rightCol] !== undefined ? String(rightData[bestIdx][key.rightCol]) : '';
          const score = (key.matchType === 'id' || key.matchType === 'exact')
            ? (exactMatch(lv, rv) ? 100 : 0)
            : similarity(lv, rv);
          return { leftCol: key.leftCol, rightCol: key.rightCol, leftVal: lv, rightVal: rv, score, matchType: key.matchType };
        });
        matched.push({ left: leftRow, right: rightData[bestIdx], compositeScore: bestScore, keyBreakdown });
        usedRight.add(bestIdx);
      }
    }

    res.json({
      matched,
      matchedCount:       matched.length,
      totalLeft:          leftData.length,
      totalRight:         rightData.length,
      unmatchedLeftCount:  leftData.length  - matched.length,
      unmatchedRightCount: rightData.length - matched.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------
// NEW: Multi-Key Match Download
// -------------------------------------------------------------------
app.post('/api/multi-key-match-download', (req, res) => {
  const { sheetLeft, sheetRight, matchKeys, threshold } = req.body;

  try {
    let leftData  = XLSX.utils.sheet_to_json(workbook.Sheets[sheetLeft]);
    let rightData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetRight]);

    const primaryKey = matchKeys.find(k => k.matchType === 'fuzzy') || matchKeys[0];
    const hasIdKey   = matchKeys.some(k => k.matchType === 'id' || k.matchType === 'exact');
    const rightIndex = buildIndex(rightData, primaryKey.rightCol);

    const matched = [], unmatchedLeft = [], unmatchedRight = [];
    const usedRight = new Set();

    for (const leftRow of leftData) {
      const leftPrimary = leftRow[primaryKey.leftCol] ? String(leftRow[primaryKey.leftCol]) : '';
      const leftPrefix  = leftPrimary.length >= 3 ? leftPrimary.substring(0, 3).toLowerCase() : '';

      let candidates = hasIdKey
        ? Array.from({ length: rightData.length }, (_, i) => i)
        : (rightIndex.get(leftPrefix) || Array.from({ length: Math.min(1000, rightData.length) }, (_, i) => i));

      let bestScore = 0, bestIdx = -1;
      for (const ri of candidates) {
        if (usedRight.has(ri)) continue;
        const score = computeCompositeScore(leftRow, rightData[ri], matchKeys);
        if (score > bestScore && score >= threshold) {
          bestScore = score;
          bestIdx   = ri;
        }
      }

      if (bestIdx !== -1) {
        matched.push({ ...leftRow, ...rightData[bestIdx], _compositeScore: bestScore });
        usedRight.add(bestIdx);
      } else {
        unmatchedLeft.push({ ...leftRow, _matchStatus: 'No match' });
      }
    }
    for (let i = 0; i < rightData.length; i++) {
      if (!usedRight.has(i)) unmatchedRight.push({ ...rightData[i], _matchStatus: 'No match' });
    }

    const wb = XLSX.utils.book_new();
    if (matched.length)        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matched),        'Matched');
    if (unmatchedLeft.length)  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedLeft),  'Unmatched_Left');
    if (unmatchedRight.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedRight), 'Unmatched_Right');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=multi_key_result.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(5000, () => console.log('Backend on 5000'));