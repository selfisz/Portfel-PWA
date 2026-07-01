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

function detectSkrybaCategoryHints(text) {
    const t = String(text || '').toLowerCase();
    const hints = { mainCategory: null, subCategory: null, query: null };

    if (/paliwo|benzyna|orlen|stacja|circle\s*k|bp\b/.test(t)) {
        hints.mainCategory = 'Samochód';
        hints.subCategory = 'Paliwo';
    } else if (/ubezpieczen/.test(t)) {
        hints.mainCategory = 'Samochód';
        hints.subCategory = 'Ubezpieczenie';
    } else if (/biedronka|lidl|kaufland|żabka|zabka|zakupy/.test(t)) {
        hints.mainCategory = 'Zakupy';
    } else if (/restaurac|jedzenie na mieście|dowóz/.test(t)) {
        hints.mainCategory = 'Jedzenie na mieście';
    } else if (/netflix|spotify|subskrypcj/.test(t)) {
        hints.mainCategory = 'Subskrypcje';
    }

    return hints;
}
