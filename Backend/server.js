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

// Abbreviation dictionary used to normalize both sides before scoring.
// Add new entries here (Query point 4 asked for IT -> Information Technology).
const ABBR_MAP = {
  pvt: 'private', ltd: 'limited', corp: 'corporation',
  inc: 'incorporated', co: 'company', llc: 'limited liability company',
  llp: 'limited liability partnership', pl: 'private limited',
  it: 'information technology', hr: 'human resources',
  bpo: 'business process outsourcing', kpo: 'knowledge process outsourcing',
  mfg: 'manufacturing', intl: 'international', assn: 'association',
  svcs: 'services', svc: 'service', grp: 'group', dev: 'development',
  tech: 'technology', ind: 'industries', mktg: 'marketing'
};

// Strip punctuation (periods, commas, ampersands, hyphens...) down to plain
// words + single spaces, BEFORE anything else touches the string. This is
// what point 2 needed: "J.d Group" and "J D group" must become identical
// strings ("j d group") so they are treated the same everywhere - including
// prefix bucketing, not just scoring.
function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[.,'’&/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandAbbr(s) {
  const cleaned = normalize(s);
  return cleaned.replace(/\b(\w+)\b/g, w => ABBR_MAP[w] || w);
}

// Generic connector words that shouldn't count as the "anchor" word of a name.
const GENERIC_WORDS = new Set(['the', 'a', 'an', 'of', 'and']);

function firstMeaningfulWord(s) {
  const words = s.split(' ').filter(Boolean);
  for (const w of words) {
    if (!GENERIC_WORDS.has(w)) return w;
  }
  return words[0] || '';
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const s1 = expandAbbr(a);
  const s2 = expandAbbr(b);
  if (s1 === s2) return 100;

  // token_set_ratio alone treats a strict subset of tokens as a 100% match
  // (e.g. "Vinnove and Services Private Limited" scores 100 against
  // "Vinnove Software and Services Private Limited", tying with the actual
  // exact match). Blending in token_sort_ratio, which is sensitive to the
  // missing/extra token, breaks that tie in favor of the more complete name.
  const setRatio = fuzzball.token_set_ratio(s1, s2);
  const sortRatio = fuzzball.token_sort_ratio(s1, s2);
  const base = (setRatio * 0.5) + (sortRatio * 0.5);

  // Give the first/anchor word of the name extra weight (point 3): the
  // opening word ("Citadel", "Morephen"...) is usually the actual identifying
  // name, while trailing words (Hotel, Group, Developer, Laboratory...) are
  // just descriptors and shouldn't be allowed to outweigh it.
  const w1 = firstMeaningfulWord(s1);
  const w2 = firstMeaningfulWord(s2);
  const firstWordScore = (w1 && w2) ? (w1 === w2 ? 100 : fuzzball.ratio(w1, w2)) : 0;

  let blended = (base * 0.6) + (firstWordScore * 0.4);

  // If the anchor words are a poor match, cap the score so a strong overlap
  // in descriptor words alone (e.g. "Developer"/"Developers") can't win
  // ("City Developers" beating "Citadel Hotel" for input "Citadel Developer").
  if (firstWordScore < 55) blended = Math.min(blended, 70);

  return Math.round(Math.max(0, Math.min(100, blended)));
}

// Helper: build prefix index (first 3 letters of the NORMALIZED value, so
// punctuation differences like "J.d" vs "J D" land in the same bucket
// instead of being silently excluded from candidates entirely)
function buildIndex(data, column) {
  const index = new Map();
  for (let i = 0; i < data.length; i++) {
    const val = data[i][column] ? normalize(data[i][column]) : '';
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
      const leftPrefix = normalize(leftVal).length >= 3 ? normalize(leftVal).substring(0, 3) : '';
      
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
    const leftPrefix = normalize(leftVal).length >= 3 ? normalize(leftVal).substring(0, 3) : '';
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
      const leftPrefix  = normalize(leftPrimary).length >= 3 ? normalize(leftPrimary).substring(0, 3) : '';

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
      const leftPrefix  = normalize(leftPrimary).length >= 3 ? normalize(leftPrimary).substring(0, 3) : '';

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