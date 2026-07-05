/* Rozliczenie miesiąca — UI duplikatów */

function renderMonthCloseTxRowHtml(tx, globalIndex) {
    return buildTransactionRowHtml(tx, { globalIndex, clickMode: 'monthClose' });
}

function buildMonthCloseDuplicatesStepHtml(duplicates) {
    if (!duplicates.length) {
        return '<p class="reports-hint">Nie znaleziono podejrzanych duplikatów.</p>';
    }
    return `<div class="month-close-tx-list">${duplicates.slice(0, 8).map((pair) => `
                    <div class="month-close-dupe-group">
                        <p class="reports-hint month-close-dupe-label">Podejrzany duplikat — kliknij transakcję, aby edytować lub usunąć</p>
                        ${renderMonthCloseTxRowHtml(pair.a.tx, pair.a.index)}
                        ${renderMonthCloseTxRowHtml(pair.b.tx, pair.b.index)}
                    </div>`).join('')}</div>`;
}

function monthCloseDeleteDuplicate(index) {
    if (typeof deleteTransactionAtIndex === 'function' && deleteTransactionAtIndex(index)) {
        renderMonthCloseWizard();
    }
}
