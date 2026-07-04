const SKRYBA_POLISH_MONTHS = {
    stycznia: 0, styczen: 0, styczniu: 0,
    lutego: 1, luty: 1, lutym: 1,
    marca: 2, marzec: 2, marcowi: 2,
    kwietnia: 3, kwiecien: 3, kwietniu: 3,
    maja: 4, maj: 4, maju: 4,
    czerwca: 5, czerwiec: 5, czerwcu: 5,
    lipca: 6, lipiec: 6, lipcu: 6,
    sierpnia: 7, sierpien: 7, sierpniu: 7,
    wrzesnia: 8, wrzesien: 8, wrzesniu: 8,
    pazdziernika: 9, pazdziernik: 9, pazdzierniku: 9,
    listopada: 10, listopad: 10, listopadzie: 10,
    grudnia: 11, grudzien: 11, grudniu: 11
};

function skrybaMonthBounds(year, monthIndex) {
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 0);
    const fmt = typeof localIsoDate === 'function'
        ? localIsoDate
        : (d) => d.toISOString().slice(0, 10);
    return { startDate: fmt(start), endDate: fmt(end) };
}

function parseSkrybaMonthToken(token) {
    const key = String(token || '').toLowerCase().replace(/ą/g, 'a').replace(/ć/g, 'c')
        .replace(/ę/g, 'e').replace(/ł/g, 'l').replace(/ń/g, 'n')
        .replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
    if (SKRYBA_POLISH_MONTHS[key] !== undefined) return SKRYBA_POLISH_MONTHS[key];
    const normalized = String(token || '').toLowerCase();
    return SKRYBA_POLISH_MONTHS[normalized];
}

function parseSkrybaPeriodFromText(text, referenceDate = new Date()) {
    const t = String(text || '').toLowerCase();

    const isoMatch = t.match(/\b(\d{4})-(\d{2})\b/);
    if (isoMatch) {
        const year = parseInt(isoMatch[1], 10);
        const month = parseInt(isoMatch[2], 10) - 1;
        if (month >= 0 && month <= 11) {
            const bounds = skrybaMonthBounds(year, month);
            return { ...bounds, label: `${isoMatch[2]}/${year}` };
        }
    }

    if (/zeszł\w*\s+miesi[aą]c|poprzedni\w*\s+miesi[aą]c|ostatni\w*\s+miesi[aą]c/.test(t)) {
        const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
        const bounds = skrybaMonthBounds(d.getFullYear(), d.getMonth());
        return { ...bounds, label: 'poprzedni miesiąc' };
    }

    if (/ten\s+miesi[aą]c|bież[aą]cy\s+miesi[aą]c|w\s+tym\s+miesi[aą]cu/.test(t)) {
        const bounds = skrybaMonthBounds(referenceDate.getFullYear(), referenceDate.getMonth());
        return { ...bounds, label: 'ten miesiąc' };
    }

    const monthMatch = t.match(/\bw\s+([a-ząćęłńóśźż]+)(?:\s+(\d{4}))?\b/);
    if (monthMatch) {
        const monthIndex = parseSkrybaMonthToken(monthMatch[1]);
        if (monthIndex !== undefined) {
            const year = monthMatch[2] ? parseInt(monthMatch[2], 10) : referenceDate.getFullYear();
            const bounds = skrybaMonthBounds(year, monthIndex);
            return { ...bounds, label: monthMatch[1] + (monthMatch[2] ? ` ${monthMatch[2]}` : '') };
        }
    }

    const bareMonth = t.match(/\b(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|wrze[sś]nia|pa[zź]dziernika|listopada|grudnia)\b/);
    if (bareMonth) {
        const monthIndex = parseSkrybaMonthToken(bareMonth[1]);
        if (monthIndex !== undefined) {
            const year = referenceDate.getFullYear();
            const bounds = skrybaMonthBounds(year, monthIndex);
            return { ...bounds, label: bareMonth[1] };
        }
    }

    return null;
}
