const CARD_ERSTE_ID = 'card-erste';
const CARD_MBANK_ID = 'card-mbank';

function getDefaultCreditCard() {
    return {
        id: '',
        name: '',
        limit: 0,
        currentBalance: 0,
        archived: false,
        archivedAt: '',
        includeInSummary: true
    };
}

function normalizeCreditCard(raw) {
    const card = { ...getDefaultCreditCard(), ...(raw && typeof raw === 'object' ? raw : {}) };
    if (!card.id) card.id = `card-${Date.now().toString(36)}`;
    card.name = (card.name || '').trim();
    card.limit = Math.max(0, parseFloat(card.limit) || 0);
    card.currentBalance = Math.max(0, parseFloat(card.currentBalance) || 0);
    if (card.limit > 0 && card.currentBalance > card.limit) {
        card.currentBalance = card.limit;
    }
    card.archived = !!card.archived;
    card.archivedAt = card.archivedAt || '';
    if (card.includeInSummary === undefined || card.includeInSummary === null) {
        card.includeInSummary = true;
    } else {
        card.includeInSummary = !!card.includeInSummary;
    }
    return card;
}

function normalizeCreditCardMovement(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const type = raw.type === 'transfer_out' ? 'transfer_out' : 'repayment';
    const amount = Math.max(0, parseFloat(raw.amount) || 0);
    if (!amount || !raw.cardId) return null;
    return {
        id: raw.id || `ccm-${Date.now().toString(36)}`,
        cardId: raw.cardId,
        type,
        amount,
        date: raw.date || localIsoDate(new Date()),
        note: raw.note || ''
    };
}

function mergeCreditCardsById(...lists) {
    const map = new Map();
    lists.flat().forEach((raw) => {
        if (!raw || typeof raw !== 'object') return;
        const card = normalizeCreditCard(raw);
        if (!card.id) return;
        const prev = map.get(card.id);
        if (!prev) {
            map.set(card.id, card);
            return;
        }
        const prevScore = (prev.limit || 0) + (prev.currentBalance || 0);
        const nextScore = (card.limit || 0) + (card.currentBalance || 0);
        map.set(card.id, nextScore >= prevScore ? card : prev);
    });
    return [...map.values()];
}

function getCreditCards() {
    return (appState.creditCards || []).map(normalizeCreditCard);
}

function getActiveCreditCards() {
    return getCreditCards().filter((card) => !card.archived && card.limit > 0);
}

function getSummaryCreditCards() {
    return getActiveCreditCards().filter((card) => card.includeInSummary !== false);
}

function toggleCreditCardSummaryInclude(cardId) {
    const card = getCreditCardById(cardId);
    if (!card) return;
    updateCreditCardInState({ ...card, includeInSummary: card.includeInSummary === false });
    saveState();
    renderLoans();
}

function getCreditCardById(id) {
    if (!id) return null;
    return getCreditCards().find((card) => card.id === id) || null;
}

function updateCreditCardInState(card) {
    const normalized = normalizeCreditCard(card);
    if (!Array.isArray(appState.creditCards)) appState.creditCards = [];
    const idx = appState.creditCards.findIndex((c) => c.id === normalized.id);
    if (idx >= 0) appState.creditCards[idx] = normalized;
    else appState.creditCards.push(normalized);
    return normalized;
}

function getCreditCardAvailable(card) {
    const c = normalizeCreditCard(card);
    if (!c.limit) return 0;
    return Math.max(0, c.limit - c.currentBalance);
}

function getCreditCardMovements(cardId = null) {
    const list = (appState.creditCardMovements || [])
        .map(normalizeCreditCardMovement)
        .filter(Boolean)
        .sort((a, b) => b.date.localeCompare(a.date));
    if (!cardId) return list;
    return list.filter((m) => m.cardId === cardId);
}

function getErsteCardSnapshot() {
    return {
        id: CARD_ERSTE_ID,
        name: 'Erste Bank',
        limit: 8200,
        currentBalance: 1468.06
    };
}

function getMbankCardSnapshot() {
    return {
        id: CARD_MBANK_ID,
        name: 'mBank',
        limit: 21500,
        currentBalance: 13111.99
    };
}

function ensureSeedCreditCards() {
    if (!Array.isArray(appState.creditCards)) appState.creditCards = [];
    let changed = false;
    [getErsteCardSnapshot, getMbankCardSnapshot].forEach((getSnapshot) => {
        const snapshot = getSnapshot();
        if (!appState.creditCards.some((c) => c.id === snapshot.id)) {
            appState.creditCards.push(normalizeCreditCard(snapshot));
            changed = true;
        }
    });
    return changed;
}

function migrateAutoArchivedCreditCards() {
    if (!Array.isArray(appState.creditCards)) return false;
    let changed = false;
    appState.creditCards = appState.creditCards.map((raw) => {
        if (!raw?.archived || !(parseFloat(raw.limit) > 0)) return raw;
        changed = true;
        return { ...raw, archived: false, archivedAt: '' };
    });
    return changed;
}

function runCreditCardMigrations() {
    if (!Array.isArray(appState.creditCards)) {
        appState.creditCards = [];
    }
    if (!Array.isArray(appState.creditCardMovements)) {
        appState.creditCardMovements = [];
    }
    const restored = migrateAutoArchivedCreditCards();
    appState.creditCards = appState.creditCards.map(normalizeCreditCard);
    appState.creditCardMovements = appState.creditCardMovements
        .map(normalizeCreditCardMovement)
        .filter(Boolean);
    return restored || ensureSeedCreditCards();
}

function adjustCreditCardBalance(cardId, delta) {
    const card = getCreditCardById(cardId);
    if (!card || !delta) return null;
    const nextBalance = Math.max(0, Math.min(card.limit || Infinity, card.currentBalance + delta));
    return updateCreditCardInState({ ...card, currentBalance: nextBalance });
}

function registerCreditCardMovement(cardId, type, amount, date, note) {
    const card = getCreditCardById(cardId);
    if (!card) return null;
    if (!amount || amount <= 0) return null;

    const movement = normalizeCreditCardMovement({
        cardId,
        type,
        amount,
        date,
        note
    });
    if (!movement) return null;

    const delta = type === 'repayment' ? -amount : amount;
    if (card.currentBalance + delta < 0) {
        if (!confirm(`Kwota przekracza zadłużenie (${formatPlnAmount(card.currentBalance)}). Kontynuować?`)) return null;
    }
    if (type === 'transfer_out' && card.limit > 0 && card.currentBalance + amount > card.limit) {
        if (!confirm(`Przekroczysz limit karty. Kontynuować?`)) return null;
    }

    let cashMovement = null;
    if (typeof syncCashForCreditCardMovement === 'function') {
        cashMovement = syncCashForCreditCardMovement(movement);
        if (!cashMovement) return null;
    }

    adjustCreditCardBalance(cardId, delta);
    if (!Array.isArray(appState.creditCardMovements)) appState.creditCardMovements = [];
    appState.creditCardMovements.unshift(movement);

    saveState();
    return getCreditCardById(cardId);
}

function applyCreditCardPurchase(cardId, amount) {
    if (!cardId || !amount) return null;
    return adjustCreditCardBalance(cardId, amount);
}

function reverseCreditCardPurchase(cardId, amount) {
    if (!cardId || !amount) return null;
    return adjustCreditCardBalance(cardId, -amount);
}

function syncCreditCardOnTransactionSave(tx, previousTx = null) {
    if (previousTx?.creditCardId && previousTx.type === 'expense') {
        reverseCreditCardPurchase(previousTx.creditCardId, previousTx.amount);
    }
    if (tx.creditCardId && tx.type === 'expense') {
        applyCreditCardPurchase(tx.creditCardId, tx.amount);
    }
}

function syncCreditCardOnTransactionDelete(tx) {
    if (tx?.creditCardId && tx.type === 'expense') {
        reverseCreditCardPurchase(tx.creditCardId, tx.amount);
    }
}

let activeCreditCardId = null;
let draftCreditCard = null;
let creditCardDetailsMode = 'view';
let creditCardQuickAction = { cardId: null, type: 'repayment' };

function openCreditCardQuickAction(cardId, type) {
    const card = getCreditCardById(cardId);
    if (!card) return;

    creditCardQuickAction = { cardId, type };
    const title = document.getElementById('credit-card-quick-title');
    const meta = document.getElementById('credit-card-quick-meta');
    const amountInput = document.getElementById('credit-card-quick-amount');

    if (title) {
        title.textContent = type === 'repayment'
            ? `Spłata — ${card.name}`
            : `Przelew z karty — ${card.name}`;
    }
    if (meta) {
        meta.textContent = type === 'repayment'
            ? `Zadłużenie: ${formatPlnAmount(card.currentBalance)}`
            : `Wolne: ${formatPlnAmount(getCreditCardAvailable(card))}`;
    }
    if (amountInput) {
        amountInput.value = '';
    }

    document.getElementById('credit-card-quick-overlay')?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => amountInput?.focus(), 50);
}

function closeCreditCardQuickAction() {
    creditCardQuickAction = { cardId: null, type: 'repayment' };
    document.getElementById('credit-card-quick-overlay')?.classList.add('hidden');
    if (!document.getElementById('credit-card-details-overlay')?.classList.contains('hidden')) return;
    document.body.style.overflow = '';
}

function confirmCreditCardQuickAction() {
    const { cardId, type } = creditCardQuickAction;
    if (!cardId) return;

    const amount = parseFloat(document.getElementById('credit-card-quick-amount')?.value);
    if (!amount || amount <= 0) {
        alert('Podaj kwotę większą od zera.');
        return;
    }

    const card = getCreditCardById(cardId);
    if (!card) return;

    const note = type === 'repayment'
        ? `Spłata ${card.name}`
        : `Przelew z karty ${card.name}`;
    const updated = registerCreditCardMovement(
        cardId,
        type,
        amount,
        localIsoDate(new Date()),
        note
    );
    if (!updated) return;

    closeCreditCardQuickAction();
    hapticFeedback();
    showSettingsToast(type === 'repayment' ? 'Spłata karty zapisana' : 'Przelew z karty zapisany');
    renderCreditCardsSection();
    renderDashboardCreditCards();
    renderLoans();
    refreshCurrentView();
}

function createDraftCreditCard() {
    return normalizeCreditCard({
        id: `card-${Date.now().toString(36)}`,
        name: '',
        limit: 0,
        currentBalance: 0
    });
}

function isDraftCreditCardActive() {
    return !!(draftCreditCard && activeCreditCardId === draftCreditCard.id);
}

function getActiveCreditCard() {
    if (isDraftCreditCardActive()) return draftCreditCard;
    if (activeCreditCardId) {
        const found = getCreditCardById(activeCreditCardId);
        if (found) return found;
    }
    return getActiveCreditCards()[0] || normalizeCreditCard({});
}

function renderCreditCardsSection() {
    if (runCreditCardMigrations()) saveState();

    const section = document.getElementById('credit-cards-section');
    const listEl = document.getElementById('credit-cards-list');
    const totalEl = document.getElementById('credit-cards-total');
    if (!section || !listEl) return;

    const cards = getActiveCreditCards();
    const allCards = getCreditCards();
    section.classList.toggle('hidden', !cards.length && !allCards.length);

    if (totalEl) {
        if (cards.length) {
            const sectionDebt = cards.reduce((sum, card) => sum + (card.currentBalance || 0), 0);
            setPlnAmountElement(totalEl, sectionDebt);
            totalEl.classList.toggle('hidden', sectionDebt <= 0);
        } else {
            totalEl.classList.add('hidden');
        }
    }

    if (!cards.length) {
        listEl.innerHTML = `<div class="card credit-card-empty-card">
            <p class="loan-empty-hint">Brak aktywnych kart.</p>
            <button type="button" class="btn-submit btn-submit--form" onclick="openNewCreditCard()">Dodaj kartę</button>
        </div>`;
        return;
    }

    listEl.innerHTML = cards.map((card) => renderCreditCardTileHtml(card)).join('');
}

function renderCreditCardTileHtml(card) {
    const available = getCreditCardAvailable(card);
    const usedPct = card.limit > 0 ? (card.currentBalance / card.limit) * 100 : 0;
    return `<div class="card credit-card-tile credit-clickable" role="button" tabindex="0"
        onclick="openCreditCardDetails('${escapeHtml(card.id)}')"
        onkeydown="if (event.key === 'Enter') openCreditCardDetails('${escapeHtml(card.id)}')">
        <div class="credit-card-tile-head">
            <span class="credit-card-type-badge">💳</span>
            <div>
                <h2 class="credit-card-title">${escapeHtml(card.name)}</h2>
                <p class="credit-card-sub">Limit ${card.limit ? formatPlnAmount(card.limit) : '—'}</p>
            </div>
        </div>
        <div class="credit-card-hero">
            <span class="loan-stat-label">Zadłużenie</span>
            <strong class="credit-card-debt-value loan-card-capital">${formatPlnAmountHtml(card.currentBalance)}</strong>
        </div>
        <p class="credit-card-meta loan-card-meta">Wolne ${formatPlnAmount(available)} · ${usedPct.toFixed(0)}% limitu</p>
        <div class="progress-bar-bg loan-progress-bar">
            <div class="progress-bar-fill" style="width:${Math.min(100, usedPct)}%;background:var(--accent)"></div>
        </div>
        <div class="credit-card-tile-actions">
            <button type="button" class="credit-card-action-btn dashboard-quick-action-btn" onclick="event.stopPropagation(); quickCreditCardRepayment('${escapeHtml(card.id)}')">Spłać</button>
            <button type="button" class="credit-card-action-btn dashboard-quick-action-btn dashboard-quick-action-btn--muted" onclick="event.stopPropagation(); quickCreditCardTransferOut('${escapeHtml(card.id)}')">Przelew</button>
        </div>
    </div>`;
}

function quickCreditCardRepayment(cardId) {
    openCreditCardQuickAction(cardId, 'repayment');
}

function quickCreditCardTransferOut(cardId) {
    openCreditCardQuickAction(cardId, 'transfer_out');
}

function populateCreditCardForm(card) {
    const nameInput = document.getElementById('credit-card-name-input');
    const limitInput = document.getElementById('credit-card-limit-input');
    const balanceInput = document.getElementById('credit-card-balance-input');
    if (nameInput) nameInput.value = card.name || '';
    if (limitInput) limitInput.value = card.limit > 0 ? card.limit : '';
    if (balanceInput) balanceInput.value = card.currentBalance > 0 ? card.currentBalance : (card.currentBalance === 0 && card.limit > 0 ? 0 : '');
}

function refreshCreditCardDetailsPanel() {
    const card = getActiveCreditCard();
    const title = document.getElementById('credit-card-details-title');
    const content = document.getElementById('credit-card-details-content');
    if (title) {
        title.textContent = isDraftCreditCardActive()
            ? 'Nowa karta'
            : (card.name || 'Karta kredytowa');
    }
    if (content && !isDraftCreditCardActive() && card.id) {
        const available = getCreditCardAvailable(card);
        const movements = getCreditCardMovements(card.id).slice(0, 8);
        const movementHtml = movements.length
            ? movements.map((m) => {
                const label = m.type === 'repayment' ? 'Spłata' : 'Przelew z karty';
                return `<div class="credit-card-movement-row">
                    <span class="credit-card-movement-label">${label}</span>
                    <span class="credit-card-movement-meta">${formatTxDate(m.date)}${m.note ? ` · ${escapeHtml(m.note)}` : ''}</span>
                    <span class="credit-card-movement-amount">${m.type === 'repayment' ? '−' : '+'}${formatPlnAmount(m.amount)}</span>
                </div>`;
            }).join('')
            : '<p class="loan-empty-hint">Brak operacji na karcie.</p>';
        content.innerHTML = `
            <div class="credit-card-detail-stats">
                <div><span class="loan-stat-label">Limit</span><strong>${formatPlnAmount(card.limit)}</strong></div>
                <div><span class="loan-stat-label">Zadłużenie</span><strong>${formatPlnAmount(card.currentBalance)}</strong></div>
                <div><span class="loan-stat-label">Wolne</span><strong>${formatPlnAmount(available)}</strong></div>
            </div>
            <h3 class="credit-card-movements-title">Operacje bez wydatków</h3>
            <div class="credit-card-movements-list">${movementHtml}</div>`;
    } else if (content) {
        content.innerHTML = '';
    }
    populateCreditCardForm(card);
}

function setCreditCardDetailsMode(mode) {
    creditCardDetailsMode = mode;
    const editBtn = document.getElementById('btn-credit-card-details-edit');
    const viewBtn = document.getElementById('btn-credit-card-details-view');
    const content = document.getElementById('credit-card-details-content');
    const editPanel = document.getElementById('credit-card-details-edit');
    const card = getActiveCreditCard();
    const configured = card.limit > 0 || card.currentBalance > 0 || card.name;

    if (mode === 'edit') {
        populateCreditCardForm(card);
        editBtn?.classList.add('hidden');
        viewBtn?.classList.toggle('hidden', !configured || isDraftCreditCardActive());
        content?.classList.add('hidden');
        editPanel?.classList.remove('hidden');
        return;
    }

    editBtn?.classList.toggle('hidden', !configured || isDraftCreditCardActive());
    viewBtn?.classList.add('hidden');
    content?.classList.toggle('hidden', !configured || isDraftCreditCardActive());
    editPanel?.classList.add('hidden');
    refreshCreditCardDetailsPanel();
}

function openNewCreditCard() {
    draftCreditCard = createDraftCreditCard();
    activeCreditCardId = draftCreditCard.id;
    document.getElementById('credit-card-details-overlay')?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setCreditCardDetailsMode('edit');
}

function openCreditCardDetails(cardId, mode) {
    if (mode === 'edit' && !cardId) {
        openNewCreditCard();
        return;
    }
    draftCreditCard = null;
    activeCreditCardId = cardId || getActiveCreditCards()[0]?.id || null;
    document.getElementById('credit-card-details-overlay')?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setCreditCardDetailsMode(mode === 'edit' ? 'edit' : 'view');
}

function closeCreditCardDetails() {
    document.getElementById('credit-card-details-overlay')?.classList.add('hidden');
    document.body.style.overflow = '';
    draftCreditCard = null;
    creditCardDetailsMode = 'view';
    setCreditCardDetailsMode('view');
}

function cancelCreditCardEdit() {
    if (isDraftCreditCardActive()) {
        draftCreditCard = null;
        closeCreditCardDetails();
        return;
    }
    setCreditCardDetailsMode('view');
}

function saveCreditCardDetails() {
    const card = getActiveCreditCard();
    const name = document.getElementById('credit-card-name-input')?.value.trim() || '';
    const limit = Math.max(0, parseFloat(document.getElementById('credit-card-limit-input')?.value) || 0);
    const currentBalance = Math.max(0, parseFloat(document.getElementById('credit-card-balance-input')?.value) || 0);

    if (!name) {
        alert('Podaj nazwę karty.');
        return;
    }
    if (!limit) {
        alert('Podaj limit karty.');
        return;
    }
    if (currentBalance > limit) {
        alert('Zadłużenie nie może być większe niż limit.');
        return;
    }

    const wasNew = isDraftCreditCardActive();
    const updated = updateCreditCardInState({
        ...card,
        name,
        limit,
        currentBalance
    });
    activeCreditCardId = updated.id;
    draftCreditCard = null;
    saveState();
    hapticFeedback();
    showSettingsToast(wasNew ? 'Karta dodana' : 'Dane karty zapisane');
    renderCreditCardsSection();
    renderDashboardCreditCards();
    populateCreditCardSelectors();
    refreshCreditCardDetailsPanel();
    setCreditCardDetailsMode('view');
}

function populateCreditCardSelectors() {
    const cards = getActiveCreditCards();
    const purchaseSelect = document.getElementById('tx-credit-card-select');
    const addSelect = document.getElementById('add-credit-card-select');

    [purchaseSelect, addSelect].forEach((select) => {
        if (!select) return;
        if (!cards.length) {
            select.innerHTML = '<option value="">— brak kart —</option>';
            select.disabled = true;
            return;
        }
        select.disabled = false;
        const current = select.value && cards.some((c) => c.id === select.value) ? select.value : cards[0].id;
        select.innerHTML = cards.map((card) =>
            `<option value="${escapeHtml(card.id)}"${card.id === current ? ' selected' : ''}>${escapeHtml(card.name)}</option>`
        ).join('');
    });

    const wrapper = document.getElementById('credit-card-purchase-wrapper');
    if (wrapper) wrapper.classList.toggle('hidden', !cards.length);
}

function onCreditCardPurchaseToggle() {
    const checked = document.getElementById('tx-credit-card')?.checked;
    const selectWrap = document.getElementById('credit-card-select-wrapper');
    const cashWrap = document.getElementById('tx-affects-cash-wrapper');
    if (selectWrap) selectWrap.classList.toggle('hidden', !checked);
    if (cashWrap) cashWrap.classList.toggle('hidden', !!checked);
    if (checked) populateCreditCardSelectors();
}

function populateAddCreditCardForm() {
    populateCreditCardSelectors();
    const type = document.getElementById('add-credit-card-type')?.value || 'repayment';
    const hint = document.getElementById('add-credit-card-hint');
    if (hint) {
        hint.textContent = type === 'repayment'
            ? 'Zmniejsza zadłużenie karty i odejmuje z gotówki — bez wpływu na wydatki w analizie.'
            : 'Przelew z karty na konto — zwiększa zadłużenie i dodaje do gotówki.';
    }
    const dateInput = document.getElementById('add-credit-card-date');
    if (dateInput && !dateInput.value) {
        dateInput.value = localIsoDate(new Date());
    }
}

function saveCreditCardMovementFromAdd() {
    const cardId = document.getElementById('add-credit-card-select')?.value;
    const type = document.getElementById('add-credit-card-type')?.value || 'repayment';
    const amount = parseFloat(document.getElementById('add-credit-card-amount')?.value);
    const date = document.getElementById('add-credit-card-date')?.value || localIsoDate(new Date());
    const note = document.getElementById('add-credit-card-note')?.value.trim() || '';

    if (!cardId) {
        alert('Wybierz kartę.');
        return;
    }
    if (!amount || amount <= 0) {
        alert('Podaj kwotę.');
        return;
    }

    const updated = registerCreditCardMovement(cardId, type, amount, date, note);
    if (!updated) return;

    addRecentCard(cardId, type);

    hapticFeedback();
    showSettingsToast(type === 'repayment' ? 'Spłata karty zapisana' : 'Przelew z karty zapisany');
    document.getElementById('add-credit-card-amount').value = '';
    document.getElementById('add-credit-card-note').value = '';
    renderCreditCardsSection();
    renderDashboardCreditCards();
    switchView('dashboard', 'Pulpit', document.querySelectorAll('.nav-item')[0]);
}

function renderDashboardCreditCards() {
    const section = document.getElementById('dashboard-credit-cards');
    const list = document.getElementById('dashboard-credit-cards-list');
    if (!section || !list) return;

    const cards = getActiveCreditCards();
    if (!cards.length) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    list.innerHTML = cards.map((card) => {
        const available = getCreditCardAvailable(card);
        const debtLabel = card.currentBalance > 0
            ? `Wolne ${formatPlnAmount(available)} · Zadłużenie ${formatPlnAmount(card.currentBalance)}`
            : `Wolne ${formatPlnAmount(available)} · spłacone`;
        return `<div class="dashboard-action-row credit-clickable" role="button" tabindex="0"
            onclick="openCreditCardDetails('${escapeHtml(card.id)}')"
            onkeydown="if (event.key === 'Enter') openCreditCardDetails('${escapeHtml(card.id)}')">
            <div class="dashboard-action-info">
                <strong class="dashboard-action-name">${escapeHtml(card.name)}</strong>
                <span class="dashboard-action-meta">${debtLabel}</span>
            </div>
            <button type="button" class="dashboard-quick-action-btn" onclick="event.stopPropagation(); quickCreditCardRepayment('${escapeHtml(card.id)}')">Spłać</button>
        </div>`;
    }).join('');
}
