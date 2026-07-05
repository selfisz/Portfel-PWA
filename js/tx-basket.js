const TX_BASKET_STORAGE_KEY = 'finanse-tx-basket-v1';

let txBasketItems = [];

function loadTxBasketFromStorage() {
    try {
        const raw = localStorage.getItem(TX_BASKET_STORAGE_KEY);
        if (!raw) {
            txBasketItems = [];
            return;
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            txBasketItems = [];
            return;
        }
        txBasketItems = parsed.filter((tx) => tx && typeof tx === 'object' && tx.date && tx.type);
    } catch {
        txBasketItems = [];
    }
}

function saveTxBasketToStorage() {
    try {
        localStorage.setItem(TX_BASKET_STORAGE_KEY, JSON.stringify(txBasketItems));
    } catch (err) {
        console.warn('saveTxBasketToStorage', err);
    }
}

function getTxBasketFingerprint(tx) {
    return typeof transactionFingerprint === 'function' ? transactionFingerprint(tx) : '';
}

function getBasketTransactions() {
    return [...txBasketItems].sort((a, b) => {
        const byDate = b.date.localeCompare(a.date);
        if (byDate !== 0) return byDate;
        return getTxBasketFingerprint(b).localeCompare(getTxBasketFingerprint(a));
    });
}

function getBasketCount() {
    return txBasketItems.length;
}

function isInTxBasket(tx) {
    const fp = getTxBasketFingerprint(tx);
    if (!fp) return false;
    return txBasketItems.some((item) => getTxBasketFingerprint(item) === fp);
}

function addTransactionsToBasket(transactions) {
    if (!Array.isArray(transactions) || !transactions.length) return 0;
    const existing = new Set(txBasketItems.map(getTxBasketFingerprint));
    let added = 0;
    transactions.forEach((tx) => {
        const fp = getTxBasketFingerprint(tx);
        if (!fp || existing.has(fp)) return;
        existing.add(fp);
        txBasketItems.push({ ...tx });
        added += 1;
    });
    if (added > 0) {
        saveTxBasketToStorage();
        updateTxBasketBadge();
    }
    return added;
}

function removeFromTxBasket(fingerprint) {
    if (!fingerprint) return;
    const before = txBasketItems.length;
    txBasketItems = txBasketItems.filter((tx) => getTxBasketFingerprint(tx) !== fingerprint);
    if (txBasketItems.length === before) return;
    saveTxBasketToStorage();
    updateTxBasketBadge();
    renderTxBasketPanel();
}

function clearTxBasket() {
    if (!txBasketItems.length) return;
    txBasketItems = [];
    saveTxBasketToStorage();
    updateTxBasketBadge();
    renderTxBasketPanel();
}

function summarizeTxBasket(txs) {
    let income = 0;
    let expense = 0;
    txs.forEach((tx) => {
        if (tx.type === 'income') income += tx.amount;
        else expense += tx.amount;
    });
    return { income, expense, balance: income - expense };
}

function updateTxBasketBadge() {
    if (typeof document === 'undefined') return;
    const tabBadge = document.getElementById('tx-basket-tab-badge');
    const count = getBasketCount();
    if (tabBadge) {
        tabBadge.textContent = count > 9 ? '9+' : String(count);
        tabBadge.classList.toggle('hidden', count === 0);
    }
    if (typeof updateNotificationsBadge === 'function') updateNotificationsBadge();
}

function renderTxBasketPanel() {
    if (typeof document === 'undefined') return;
    const listEl = document.getElementById('tx-basket-list');
    const summaryEl = document.getElementById('tx-basket-summary');
    const clearBtn = document.getElementById('btn-tx-basket-clear');
    const pdfBtn = document.getElementById('btn-tx-basket-pdf');
    if (!listEl) return;

    const txs = getBasketTransactions();
    if (summaryEl) {
        if (!txs.length) {
            summaryEl.textContent = 'Brak transakcji w koszyku';
        } else {
            const s = summarizeTxBasket(txs);
            summaryEl.textContent = `${txs.length} transakcji · Wpływy: ${formatPlnAmount(s.income)} · Wydatki: ${formatPlnAmount(s.expense)} · Bilans: ${formatPlnAmount(s.balance)}`;
        }
    }
    if (clearBtn) clearBtn.disabled = txs.length === 0;
    if (pdfBtn) pdfBtn.disabled = txs.length === 0;

    if (!txs.length) {
        listEl.innerHTML = '<div class="empty-state"><p>Dodaj transakcje z pulpitu — przycisk „Zaznacz”, potem „Dodaj do koszyka”.</p></div>';
        return;
    }

    listEl.innerHTML = '';
    txs.forEach((t) => {
        const fp = getTxBasketFingerprint(t);
        const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
        const row = document.createElement('div');
        row.className = 'tx-row tx-row--basket';
        row.innerHTML = `
            ${typeof renderCategoryIcon === 'function'
                ? renderCategoryIcon(t.mainCategory, 'list', t.subCategory !== '[Bez podkategorii]' ? t.subCategory : null, t.type)
                : ''}
            <div class="tx-info">
                <div class="tx-title">${escapeHtml(title)}</div>
                <div class="tx-meta">${formatTxDate(t.date)} · ${escapeHtml(t.mainCategory)}</div>
                ${t.note ? `<div class="tx-note">${escapeHtml(t.note)}</div>` : ''}
            </div>
            <div class="tx-amount-col">
                <div class="tx-amount ${t.type}">${t.type === 'expense' ? '-' : '+'}${t.amount.toFixed(2)} zł</div>
            </div>
            <button type="button" class="tx-basket-remove" aria-label="Usuń z koszyka" data-tx-fp="${escapeHtml(fp)}">×</button>`;
        listEl.appendChild(row);
    });

    listEl.querySelectorAll('.tx-basket-remove').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromTxBasket(btn.dataset.txFp || '');
        });
    });
}

function exportTxBasketPdf() {
    const txs = getBasketTransactions();
    if (!txs.length) {
        if (typeof showAppToast === 'function') showAppToast('Koszyk jest pusty', 'error');
        return;
    }
    if (typeof openPrintPreview !== 'function') return;
    if (typeof closeNotificationsPanel === 'function') closeNotificationsPanel();
    openPrintPreview(buildTxBasketPrintBody(), 'Koszyk PDF', { source: 'tx-basket' });
}

function confirmClearTxBasket() {
    if (!getBasketCount()) return;
    if (!confirm('Wyczyścić koszyk?\nTransakcje w aplikacji pozostaną bez zmian.')) return;
    clearTxBasket();
    if (typeof showAppToast === 'function') showAppToast('Koszyk wyczyszczony');
}

function buildTxBasketPrintBody() {
    const txs = getBasketTransactions();
    const title = `Koszyk — ${txs.length} transakcji`;
    if (typeof buildTransactionsPeriodSection === 'function') {
        return buildTransactionsPeriodSection(txs, title, true);
    }
    return `<h1 class="reports-pdf-title">${escapeHtml(title)}</h1><p>Brak generatora PDF.</p>`;
}

function promptClearTxBasketAfterPrint() {
    if (!getBasketCount()) return;
    if (!confirm('Wydruk uruchomiony. Wyczyścić koszyk?')) return;
    clearTxBasket();
    if (typeof showAppToast === 'function') showAppToast('Koszyk wyczyszczony');
}

function initTxBasket() {
    loadTxBasketFromStorage();
    updateTxBasketBadge();
}
