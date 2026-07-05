function getTransactionRowTitle(tx) {
    return tx.subCategory === '[Bez podkategorii]' ? tx.mainCategory : tx.subCategory;
}

function buildTransactionRowHtml(tx, options = {}) {
    if (!tx) return '';

    const {
        globalIndex = -1,
        clickMode = 'none',
        extraClass = ''
    } = options;

    if (clickMode === 'monthClose' && globalIndex < 0) return '';

    const escape = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s ?? '');
    const fmtDate = typeof formatTxDate === 'function' ? formatTxDate : (d) => d;
    const fmtAmount = typeof formatPlnAmount === 'function' ? formatPlnAmount : (n) => `${Number(n).toFixed(2)} zł`;
    const iconHtml = typeof renderCategoryIcon === 'function'
        ? renderCategoryIcon(
            tx.mainCategory,
            'list',
            tx.subCategory !== '[Bez podkategorii]' ? tx.subCategory : null,
            tx.type
        )
        : '';

    const title = getTransactionRowTitle(tx);
    const amountClass = tx.type === 'expense' ? 'expense' : 'income';
    const sign = tx.type === 'expense' ? '−' : '+';

    const classes = ['reports-tx-row'];
    if (extraClass) classes.push(extraClass);
    if (clickMode === 'skryba') classes.push('skryba-tx-row');

    let attrs = `type="button" class="${classes.join(' ')}"`;

    if (clickMode === 'open' && globalIndex >= 0) {
        attrs += ` data-action="open-transaction" data-tx-index="${globalIndex}"`;
    } else if (clickMode === 'monthClose' && globalIndex >= 0) {
        attrs += ` data-action="month-close-transaction" data-tx-index="${globalIndex}" onclick="monthCloseOpenTransactionDetails(${globalIndex})"`;
    } else if (clickMode === 'duplicateReview' && globalIndex >= 0) {
        attrs += ` data-action="duplicate-review-transaction" data-tx-index="${globalIndex}" onclick="duplicateReviewEdit(${globalIndex})"`;
    } else if (clickMode === 'skryba') {
        if (globalIndex >= 0) attrs += ` data-tx-index="${globalIndex}"`;
        else attrs += ' disabled';
    }

    return `<button ${attrs}>
        ${iconHtml}
        <span class="reports-tx-row-text">
            <span class="reports-tx-row-title">${escape(title)}</span>
            <span class="reports-tx-row-meta">${fmtDate(tx.date)} · ${escape(tx.mainCategory)}</span>
        </span>
        <span class="reports-tx-row-amount ${amountClass}">${sign}${fmtAmount(tx.amount)}</span>
    </button>`;
}
