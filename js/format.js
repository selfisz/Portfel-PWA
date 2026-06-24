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
    return `${amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
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
        .replace(/"/g, '&quot;');
}
function formatCompactPln(amount) {
    if (amount >= 10000) return `${(amount / 1000).toFixed(0)}k`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k`;
    return `${Math.round(amount)}`;
}
function escapeCsvField(value) {
    const text = String(value ?? '');
    if (text.includes(';') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}
