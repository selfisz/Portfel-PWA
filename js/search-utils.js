function levenshteinDistance(a, b) {
    const s = String(a || '');
    const t = String(b || '');
    if (s === t) return 0;
    if (!s.length) return t.length;
    if (!t.length) return s.length;
    const rows = s.length + 1;
    const cols = t.length + 1;
    const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));
    for (let i = 0; i < rows; i++) matrix[i][0] = i;
    for (let j = 0; j < cols; j++) matrix[0][j] = j;
    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[s.length][t.length];
}

function fuzzyWordMatch(word, candidate, threshold = 0.78) {
    const w = String(word || '').toLowerCase();
    const c = String(candidate || '').toLowerCase();
    if (!w || !c) return false;
    if (c.includes(w) || w.includes(c)) return true;
    if (w.length < 4) return w === c;
    const maxLen = Math.max(w.length, c.length);
    const similarity = 1 - levenshteinDistance(w, c) / maxLen;
    return similarity >= threshold;
}

function fuzzyTextMatchesQuery(haystack, query) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return true;
    const h = String(haystack || '').toLowerCase();
    if (!h) return false;
    if (h.includes(q)) return true;
    if (q.length < 4) return false;
    const queryTokens = q.split(/\s+/).filter((token) => token.length >= 3);
    if (!queryTokens.length) return false;
    const hayWords = h.split(/[\s,;.·›\-/]+/).filter(Boolean);
    return queryTokens.every((token) => hayWords.some((word) => fuzzyWordMatch(token, word)));
}

function filterItemsByFuzzyCategoryField(items, field, filterName) {
    const name = String(filterName || '').trim();
    if (!name) return items;
    const exact = items.filter((item) => item[field] === name);
    if (exact.length) return exact;
    const fuzzy = items.filter((item) => fuzzyTextMatchesQuery(item[field], name));
    if (fuzzy.length) return fuzzy;
    return items;
}

function transactionMatchesFuzzyQuery(t, query) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return true;
    return fuzzyTextMatchesQuery(t.mainCategory, q)
        || fuzzyTextMatchesQuery(t.subCategory, q)
        || fuzzyTextMatchesQuery(t.note || '', q)
        || String(t.amount).includes(q)
        || String(t.date || '').includes(q);
}
