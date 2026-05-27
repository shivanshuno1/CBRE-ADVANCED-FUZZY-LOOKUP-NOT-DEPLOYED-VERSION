import * as fuzzball from 'fuzzball';

export function matchAbbreviation(input, dictionary, threshold = 60) {
  if (!input || input.length === 0) return null;
  const cleanInput = input.toLowerCase().trim();
  let extractedInput = cleanInput;
  if (cleanInput.includes('-')) {
    const beforeDash = cleanInput.split('-')[0].trim();
    if (beforeDash.length > 0 && beforeDash.length <= 15) extractedInput = beforeDash;
  }
  const uppercaseMatch = input.match(/[A-Z]{2,}/g);
  if (uppercaseMatch && uppercaseMatch[0]) extractedInput = uppercaseMatch[0].toLowerCase();
  
  let bestMatch = null, bestScore = 0;
  for (const entry of dictionary) {
    const shortLower = entry.short.toLowerCase();
    if (extractedInput === shortLower || cleanInput === shortLower) return { ...entry, score: 100 };
    const cleanExtracted = extractedInput.replace(/[^a-z0-9]/g, '');
    const cleanShort = shortLower.replace(/[^a-z0-9]/g, '');
    if (cleanExtracted === cleanShort) return { ...entry, score: 100 };
    
    const ratio = fuzzball.ratio(extractedInput, shortLower);
    if (ratio > bestScore && ratio >= threshold) { bestScore = ratio; bestMatch = { ...entry, score: Math.round(ratio) }; }
    const partialRatio = fuzzball.partial_ratio(extractedInput, shortLower);
    if (partialRatio > bestScore && partialRatio >= threshold) { bestScore = partialRatio; bestMatch = { ...entry, score: Math.round(partialRatio) }; }
    const tokenRatio = fuzzball.token_set_ratio(extractedInput, shortLower);
    if (tokenRatio > bestScore && tokenRatio >= threshold) { bestScore = tokenRatio; bestMatch = { ...entry, score: Math.round(tokenRatio) }; }
  }
  return bestMatch;
}

export function detectPotentialAbbreviations(dataRows) {
  const abbrevSet = new Set();
  const regex = /\b[A-Z]{2,}(?:\s*\.\s*[A-Z]{2,})*\b/g;
  for (const row of dataRows) {
    if (!row) continue;
    const matches = String(row).match(regex);
    if (matches) {
      matches.forEach(m => {
        let cleaned = m.toUpperCase().replace(/[.\s]/g, '');
        if (cleaned.length >= 2 && !/^\d+$/.test(cleaned)) abbrevSet.add(cleaned);
      });
    }
  }
  return Array.from(abbrevSet).sort();
}