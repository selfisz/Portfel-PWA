function skrybaEntityScore(query, candidate) {
    const q = String(query || '').toLowerCase().trim();
    const c = String(candidate || '').toLowerCase().trim();
    if (!q || !c) return 0;
    if (c === q) return 100;
    if (c.includes(q) || q.includes(c)) return 80;
    if (typeof fuzzyTextMatchesQuery === 'function' && fuzzyTextMatchesQuery(c, q)) return 60;
    return 0;
}

function resolveSkrybaLoan(query) {
    const q = String(query || '').trim();
    if (!q || typeof getActiveLoans !== 'function') {
        return { loan: null, matches: [], error: 'Podaj nazwę kredytu.' };
    }
    const loans = getActiveLoans();
    const scored = loans.map((loan) => {
        const name = typeof getLoanDisplayName === 'function' ? getLoanDisplayName(loan) : (loan.name || '');
        const labels = [name, loan.name, loan.subCategory].filter(Boolean);
        const score = Math.max(...labels.map((label) => skrybaEntityScore(q, label)));
        return { loan, score, label: name };
    }).filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);

    if (!scored.length) {
        return { loan: null, matches: [], error: `Nie znalazłem kredytu pasującego do „${q}".` };
    }
    if (scored.length > 1 && scored[0].score === scored[1].score) {
        return { loan: null, matches: scored.slice(0, 4), ambiguous: true };
    }
    return { loan: scored[0].loan, matches: scored, ambiguous: false };
}

function resolveSkrybaCard(query) {
    const q = String(query || '').trim();
    if (!q || typeof getActiveCreditCards !== 'function') {
        return { card: null, matches: [], error: 'Podaj nazwę karty.' };
    }
    const cards = getActiveCreditCards();
    const scored = cards.map((card) => {
        const score = skrybaEntityScore(q, card.name);
        return { card, score, label: card.name };
    }).filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);

    if (!scored.length) {
        return { card: null, matches: [], error: `Nie znalazłem karty pasującej do „${q}".` };
    }
    if (scored.length > 1 && scored[0].score === scored[1].score) {
        return { card: null, matches: scored.slice(0, 4), ambiguous: true };
    }
    return { card: scored[0].card, matches: scored, ambiguous: false };
}

function parseSkrybaAmountFromText(text) {
    const m = String(text || '').match(/(\d+(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)?/i);
    if (!m) return null;
    return typeof parsePlnInput === 'function'
        ? parsePlnInput(m[1])
        : parseFloat(m[1].replace(',', '.'));
}

function parseSkrybaAmountFilterFromText(text) {
    const raw = String(text || '');
    const t = normalizeSkrybaHintText(raw);
    const result = {};

    const abovePatterns = [
        /(?:powyzej|powyuzej|wiecej niz|wieksze niz|powyzej kwoty|od)\s+(\d+(?:[.,]\d{1,2})?)/,
        /(\d+(?:[.,]\d{1,2})?)\s*(?:zl|pln)?\s*(?:i\s+)?(?:wiecej|wyzej)/
    ];
    const belowPatterns = [
        /(?:ponizej|ponizej|mniej niz|nizsze niz|do)\s+(\d+(?:[.,]\d{1,2})?)/
    ];

    for (const pattern of abovePatterns) {
        const match = t.match(pattern);
        if (!match) continue;
        const amount = parseSkrybaAmountFromText(match[1]);
        if (Number.isFinite(amount) && amount > 0 && !isLikelySkrybaYearAmount(amount, raw)) {
            result.minAmount = amount;
            break;
        }
    }

    for (const pattern of belowPatterns) {
        const match = t.match(pattern);
        if (!match) continue;
        const amount = parseSkrybaAmountFromText(match[1]);
        if (Number.isFinite(amount) && amount > 0 && !isLikelySkrybaYearAmount(amount, raw)) {
            result.maxAmount = amount;
            break;
        }
    }

    return Object.keys(result).length ? result : null;
}

function normalizeSkrybaHintText(text) {
    return String(text || '').toLowerCase()
        .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
        .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
}

function isLikelySkrybaYearAmount(amount, text) {
    if (!Number.isFinite(amount)) return false;
    const whole = Math.round(amount);
    if (whole < 1990 || whole > 2099 || Math.abs(amount - whole) > 0.001) return false;
    const t = normalizeSkrybaHintText(text);
    if (/\b(?:w|na|rok[u]?|r\.?)\s*(?:19|20)\d{2}\b/.test(t)) return true;
    if (/\b(?:19|20)\d{2}\s*rok/.test(t)) return true;
    if (/\b(?:19|20)\d{2}\b/.test(t) && !/\b(?:19|20)\d{2}\s*(?:zł|zl|pln)\b/.test(t)) return true;
    return false;
}

function isSkrybaReadOnlyQuery(text) {
    const t = normalizeSkrybaHintText(text).trim();
    if (!t) return false;
    if (/^(ile|kiedy|czy|jak|co|gdzie|poka[zż]|pokaz|wy[sś]wietl|suma|lista|por[oó]wnaj|transakcj)/.test(t)) return true;
    if (/\b(ile|jak\s+duzo|jak\s+dużo)\s+(wyda|koszt|bylo|było|poszlo|poszło|lacznie|łącznie)\b/.test(t)) return true;
    if (/\bw\s+(?:19|20)\d{2}\b/.test(t) && !/^\d+(?:[.,]\d+)?\s*(?:zł|zl|pln)\b/.test(t)) return true;
    if (/\b(czynsz|rata|najem|przyjemnos|przyjemnoś|oplat\w*\s+mieszk)\b/.test(t)
        && !/^\d+(?:[.,]\d+)?\s*(?:zł|zl|pln)\b/.test(t)) return true;
    return false;
}

function detectSkrybaCategoryHints(text) {
    const t = normalizeSkrybaHintText(text);
    const hints = { mainCategory: null, subCategory: null, query: null };

    if (/paliwo|benzyna|orlen|stacja|circle\s*k|bp\b/.test(t)) {
        hints.mainCategory = 'Samochód';
        hints.subCategory = 'Paliwo';
    } else if (/ubezpieczen/.test(t)) {
        hints.mainCategory = 'Samochód';
        hints.subCategory = 'Ubezpieczenie';
    } else if (/biedronka|lidl|kaufland|zabka|zakupy/.test(t)) {
        hints.mainCategory = 'Zakupy';
    } else if (/restaurac|jedzenie na miescie|dowoz/.test(t)) {
        hints.mainCategory = 'Jedzenie na mieście';
    } else if (/netflix|spotify|subskrypcj/.test(t)) {
        hints.mainCategory = 'Subskrypcje';
    } else if (/czynsz|najem|oplat\w*\s+mieszk/.test(t)) {
        hints.mainCategory = 'Dom';
        hints.subCategory = 'Czynsz';
        hints.query = 'czynsz';
    } else if (/przyjemnos/.test(t)) {
        hints.mainCategory = 'Przyjemności';
    }

    if (hints.mainCategory) return hints;

    const tree = typeof categoryTree !== 'undefined'
        ? categoryTree
        : (typeof DEFAULT_CATEGORY_TREE !== 'undefined' ? DEFAULT_CATEGORY_TREE : null);
    if (!tree) return hints;

    let bestMain = null;
    let bestSub = null;
    let bestScore = 0;

    ['expense', 'income'].forEach((type) => {
        Object.entries(tree[type] || {}).forEach(([main, subs]) => {
            const mainNorm = normalizeSkrybaHintText(main);
            let mainScore = 0;
            if (mainNorm.length >= 4 && t.includes(mainNorm)) mainScore = mainNorm.length + 12;
            else if (typeof fuzzyTextMatchesQuery === 'function' && fuzzyTextMatchesQuery(main, text)) {
                mainScore = 50 + mainNorm.length;
            }
            if (mainScore > bestScore) {
                bestScore = mainScore;
                bestMain = main;
                bestSub = null;
            }
            (subs || []).forEach((sub) => {
                if (!sub || sub === '[Bez podkategorii]') return;
                const subNorm = normalizeSkrybaHintText(sub);
                let subScore = 0;
                if (subNorm.length >= 4 && t.includes(subNorm)) subScore = subNorm.length + 8;
                else if (typeof fuzzyTextMatchesQuery === 'function' && fuzzyTextMatchesQuery(sub, text)) {
                    subScore = 45 + subNorm.length;
                }
                if (subScore > bestScore) {
                    bestScore = subScore;
                    bestMain = main;
                    bestSub = sub;
                }
            });
        });
    });

    if (bestMain) {
        hints.mainCategory = bestMain;
        hints.subCategory = bestSub;
    }
    return hints;
}

function resolveSkrybaCategoryFromText(text) {
    return detectSkrybaCategoryHints(text);
}
