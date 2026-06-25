function formatDateGroup(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Dzisiaj';
    if (d.toDateString() === yesterday.toDateString()) return 'Wczoraj';
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatPlnAmount(amount) {
    const n = Number(amount);
    if (amount == null || isNaN(n)) return '— zł';
    return `${n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

function formatTxDate(dateStr) {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function formatCompactPln(amount) {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    if (abs >= 10000) return `${sign}${(abs / 1000).toFixed(0)}k`;
    if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}k`;
    return `${Math.round(amount)}`;
}
function escapeCsvField(value) {
    const text = String(value ?? '');
    if (text.includes(';') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

/** Parsuje kwotę z pola formularza (PL: „12,50”, „12.50”, „1 234,56”, opcjonalnie „ zł”). */
function parsePlnInput(raw) {
    if (raw == null) return NaN;
    let s = String(raw).trim();
    if (!s) return NaN;

    s = s.replace(/\s*(zł|pln)\s*$/i, '').trim();
    s = s.replace(/[\s\u00a0\u202f]/g, '');
    s = s.replace(/[\u201a\uFF0C]/g, ',');

    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    if (hasComma && hasDot) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
            s = s.replace(/\./g, '').replace(/,/g, '.');
        } else {
            s = s.replace(/,/g, '');
        }
    } else if (hasComma) {
        s = s.replace(/,/g, '.');
    } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(s)) {
        s = s.replace(/\./g, '');
    }

    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
}
