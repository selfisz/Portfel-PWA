let loanDetailsMode = 'view';
let activeLoanId = null;
let draftLoan = null;
let loanPaymentsFilter = 'all';
let loanPaymentsVisibleCount = LIST_PAGE_SIZE;
let loanPaymentsListSignature = '';

function resetLoanPaymentsListPagination() {
    loanPaymentsVisibleCount = LIST_PAGE_SIZE;
    loanPaymentsListSignature = '';
}

function showMoreLoanPayments() {
    loanPaymentsVisibleCount += LIST_PAGE_SIZE;
    renderLoanRecentPayments();
}

function createDraftLoan() {
    return normalizeLoan({
        id: `loan-${Date.now().toString(36)}`,
        name: '',
        subCategory: '',
        totalAmount: 0,
        currentCapitalLeft: 0,
        interestRate: 0,
        nextInstallmentAmount: 0,
        nextInstallmentDue: ''
    });
}

function isDraftLoanActive() {
    return !!(draftLoan && activeLoanId === draftLoan.id);
}

function getActiveLoan() {
    if (isDraftLoanActive()) return draftLoan;
    const loans = getLoans();
    if (activeLoanId) {
        const found = getLoanById(activeLoanId);
        if (found) return found;
    }
    return loans.find(isLoanConfigured) || loans[0] || normalizeLoan({});
}

let loansArchiveExpanded = false;
let loansSummaryExpanded = false;
let loansAddExpanded = false;

function toggleLoansSummary() {
    loansSummaryExpanded = !loansSummaryExpanded;
    const panel = document.getElementById('loans-summary-panel');
    const toggle = document.querySelector('#loans-summary-block .loans-hero-summary-toggle');
    if (panel) panel.classList.toggle('hidden', !loansSummaryExpanded);
    if (toggle) {
        toggle.setAttribute('aria-expanded', loansSummaryExpanded ? 'true' : 'false');
    }
}

function toggleLoansAdd() {
    loansAddExpanded = !loansAddExpanded;
    const panel = document.getElementById('loans-add-panel');
    const toggle = document.querySelector('#loans-add-block .loans-hero-add-toggle');
    if (panel) panel.classList.toggle('hidden', !loansAddExpanded);
    if (toggle) {
        toggle.setAttribute('aria-expanded', loansAddExpanded ? 'true' : 'false');
    }
}

function collapseLoansAdd() {
    loansAddExpanded = false;
    const panel = document.getElementById('loans-add-panel');
    const toggle = document.querySelector('#loans-add-block .loans-hero-add-toggle');
    if (panel) panel.classList.add('hidden');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function openNewLoanFromHero() {
    collapseLoansAdd();
    openNewLoan();
}

function openNewCreditCardFromHero() {
    collapseLoansAdd();
    openNewCreditCard();
}

function toggleLoansArchive() {
    loansArchiveExpanded = !loansArchiveExpanded;
    const list = document.getElementById('loans-archive-list');
    const toggle = document.querySelector('.loans-archive-toggle');
    if (list) list.classList.toggle('hidden', !loansArchiveExpanded);
    if (toggle) {
        toggle.setAttribute('aria-expanded', loansArchiveExpanded ? 'true' : 'false');
        toggle.classList.toggle('loans-archive-toggle--open', loansArchiveExpanded);
    }
}

function renderLoans() {
    if (runLoanMigrations()) saveState();
    if (runCreditCardMigrations()) saveState();
    appState.loans = getLoans();

    const activeLoans = getActiveLoans();
    const archivedLoans = getArchivedLoans();
    const cardDebt = getCreditCardDebtTotal();
    const summaryTotal = getLoanSummaryTotal();
    const summaryCount = getLoanSummaryCount();
    const debtItemCount = getDebtSummaryTotalCount();
    const hasDebtSummary = activeLoans.length > 0 || cardDebt > 0;
    const totalHero = document.getElementById('loans-total-hero');
    const totalCapitalEl = document.getElementById('loans-total-capital');
    const totalMetaEl = document.getElementById('loans-total-meta');
    const listEl = document.getElementById('loans-list');
    const loansActiveTotalEl = document.getElementById('loans-active-total');
    const paymentsSection = document.getElementById('loans-payments-section');
    const archiveSection = document.getElementById('loans-archive-section');
    const archiveList = document.getElementById('loans-archive-list');
    const archiveCount = document.getElementById('loans-archive-count');

    if (totalHero) totalHero.classList.toggle('hidden', !hasDebtSummary);
    if (totalCapitalEl && hasDebtSummary) setPlnAmountElement(totalCapitalEl, summaryTotal);
    if (totalMetaEl) {
        if (!hasDebtSummary) {
            totalMetaEl.classList.add('hidden');
        } else {
            const parts = [];
            const loanCapital = getActiveLoans()
                .filter((loan) => loan.includeInSummary !== false)
                .reduce((sum, loan) => sum + (loan.currentCapitalLeft || 0), 0);
            const summaryCardDebt = typeof getCreditCardDebtTotal === 'function' ? getCreditCardDebtTotal() : cardDebt;
            if (activeLoans.length && loanCapital > 0) {
                parts.push(`Kredyty ${formatPlnAmount(loanCapital)}`);
            }
            if (summaryCardDebt > 0) {
                parts.push(`Karty ${formatPlnAmount(summaryCardDebt)}`);
            }
            if (debtItemCount >= 2 && summaryCount < debtItemCount) {
                parts.push(`${summaryCount} z ${debtItemCount} w sumie`);
            }
            if (parts.length) {
                totalMetaEl.textContent = parts.join(' · ');
                totalMetaEl.classList.remove('hidden');
            } else {
                totalMetaEl.classList.add('hidden');
            }
        }
    }
    renderLoansSummaryChips(activeLoans);

    if (loansActiveTotalEl) {
        if (activeLoans.length) {
            setPlnAmountElement(loansActiveTotalEl, getLoanCapitalLeft());
            loansActiveTotalEl.classList.remove('hidden');
        } else {
            loansActiveTotalEl.classList.add('hidden');
        }
    }
    if (paymentsSection) paymentsSection.classList.toggle('hidden', !activeLoans.length);

    if (listEl) {
        if (!activeLoans.length) {
            listEl.innerHTML = `<div class="card loan-empty-card">
                <p class="loan-empty-hint">Brak aktywnych kredytów.</p>
                <button type="button" class="btn-submit" onclick="openNewLoan()">Dodaj kredyt</button>
            </div>`;
        } else {
            listEl.innerHTML = activeLoans.map((loan) => renderLoanCardHtml(loan)).join('');
        }
    }

    if (archiveSection) archiveSection.classList.toggle('hidden', !archivedLoans.length);
    if (archiveCount) archiveCount.textContent = String(archivedLoans.length);
    if (archiveList) {
        archiveList.innerHTML = archivedLoans.length
            ? archivedLoans.map((loan) => renderArchivedLoanCardHtml(loan)).join('')
            : '<p class="loan-empty-hint">Brak spłaconych kredytów.</p>';
        archiveList.classList.toggle('hidden', !loansArchiveExpanded);
    }
    const archiveToggle = document.querySelector('.loans-archive-toggle');
    if (archiveToggle) {
        archiveToggle.setAttribute('aria-expanded', loansArchiveExpanded ? 'true' : 'false');
        archiveToggle.classList.toggle('loans-archive-toggle--open', loansArchiveExpanded);
    }

    if (loanPaymentsFilter !== 'all' && !activeLoans.some((loan) => loan.id === loanPaymentsFilter)) {
        loanPaymentsFilter = 'all';
    }
    renderLoanPaymentsFilter(activeLoans);
    renderLoanRecentPayments();
    renderCreditCardsSection();
}

function renderLoansSummaryChips(activeLoans) {
    const el = document.getElementById('loans-summary-chips');
    const block = document.getElementById('loans-summary-block');
    if (!el) return;

    const cards = typeof getActiveCreditCards === 'function' ? getActiveCreditCards() : [];
    const totalItems = activeLoans.length + cards.length;
    if (totalItems < 2) {
        el.innerHTML = '';
        block?.classList.add('hidden');
        return;
    }
    block?.classList.remove('hidden');

    const loanChips = activeLoans.map((loan) => {
        const included = loan.includeInSummary !== false;
        return `<button type="button" class="toggle-btn loans-chip${included ? ' active' : ''}" onclick="toggleLoanSummaryInclude('${escapeHtml(loan.id)}')" aria-pressed="${included ? 'true' : 'false'}">${escapeHtml(getLoanDisplayName(loan))}</button>`;
    });
    const cardChips = cards.map((card) => {
        const included = card.includeInSummary !== false;
        const label = card.name?.trim() || 'Karta';
        return `<button type="button" class="toggle-btn loans-chip${included ? ' active' : ''}" onclick="toggleCreditCardSummaryInclude('${escapeHtml(card.id)}')" aria-pressed="${included ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
    });
    el.innerHTML = [...loanChips, ...cardChips].join('');
}

function toggleLoanSummaryInclude(loanId) {
    const loan = getLoanById(loanId);
    if (!loan) return;
    updateLoanInState({ ...loan, includeInSummary: loan.includeInSummary === false });
    saveState();
    renderLoans();
}

function setAllLoansSummaryInclude(included) {
    getActiveLoans().forEach((loan) => {
        const currentlyIncluded = loan.includeInSummary !== false;
        if (currentlyIncluded === included) return;
        updateLoanInState({ ...loan, includeInSummary: included });
    });
    if (typeof getActiveCreditCards === 'function') {
        getActiveCreditCards().forEach((card) => {
            const currentlyIncluded = card.includeInSummary !== false;
            if (currentlyIncluded === included) return;
            updateCreditCardInState({ ...card, includeInSummary: included });
        });
    }
    saveState();
    renderLoans();
}

function setLoanPaymentsFilter(filter) {
    loanPaymentsFilter = filter || 'all';
    updateLoanPaymentsFilterLabels();
    renderLoanRecentPayments();
}

function handleLoanPaymentsFilterChange() {
    const select = document.getElementById('loans-payments-filter-select');
    setLoanPaymentsFilter(select?.value || 'all');
}

function getLoanPaymentsFilterLabel() {
    if (loanPaymentsFilter === 'all') return 'Wszystkie kredyty';
    const loan = getLoanById(loanPaymentsFilter);
    return loan ? getLoanDisplayName(loan) : 'Wszystkie kredyty';
}

function updateLoanPaymentsFilterLabels() {
    const label = getLoanPaymentsFilterLabel();
    const selectLabel = document.getElementById('loans-payments-select-label');
    const select = document.getElementById('loans-payments-filter-select');
    if (selectLabel) selectLabel.textContent = label;
    if (select && select.value !== loanPaymentsFilter) select.value = loanPaymentsFilter;
}

function renderLoanPaymentsFilter(activeLoans) {
    const block = document.getElementById('loans-payments-filter-block');
    const select = document.getElementById('loans-payments-filter-select');
    if (!block || !select) return;

    if (activeLoans.length < 2) {
        block.classList.add('hidden');
        loanPaymentsFilter = 'all';
        return;
    }

    block.classList.remove('hidden');
    select.innerHTML = [
        '<option value="all">Wszystkie kredyty</option>',
        ...activeLoans.map((loan) =>
            `<option value="${escapeHtml(loan.id)}">${escapeHtml(getLoanDisplayName(loan))}</option>`
        )
    ].join('');

    if (!activeLoans.some((loan) => loan.id === loanPaymentsFilter)) {
        loanPaymentsFilter = 'all';
    }
    select.value = loanPaymentsFilter;
    updateLoanPaymentsFilterLabels();
}

function renderLoanCardHtml(loan) {
    const paidPct = getLoanPaidPercent(loan);
    const paidAmount = getLoanPaidAmount(loan);
    const nextLine = loan.nextInstallmentAmount > 0
        ? `<p class="loan-next-installment">Następna rata: ${formatPlnAmount(loan.nextInstallmentAmount)}${loan.nextInstallmentDue ? ` · do ${formatTxDate(loan.nextInstallmentDue)}` : ''}</p>`
        : '';
    const rateLine = loan.interestRate > 0
        ? `${loan.interestRate.toLocaleString('pl-PL', { maximumFractionDigits: 2 })}%`
        : '0%';

    return `<div class="card loan-summary-card loan-clickable" role="button" tabindex="0"
        onclick="openLoanDetails('${escapeHtml(loan.id)}')"
        onkeydown="if (event.key === 'Enter') openLoanDetails('${escapeHtml(loan.id)}')">
        <div class="loan-card-head">
            <span class="loan-type-badge">🏦</span>
            <div>
                <h2 class="loan-card-title">${escapeHtml(getLoanDisplayName(loan))}</h2>
                <p class="loan-card-sub">${escapeHtml(loan.subCategory || 'Kredyt')} · ${escapeHtml(rateLine)}</p>
            </div>
        </div>
        <div class="loan-card-hero">
            <span class="loan-stat-label">Pozostało</span>
            <strong class="loan-card-capital">${formatPlnAmountHtml(loan.currentCapitalLeft)}</strong>
        </div>
        ${nextLine}
        <div class="progress-bar-bg loan-progress-bar">
            <div class="progress-bar-fill" style="width:${Math.min(100, paidPct)}%;background:var(--success)"></div>
        </div>
        <p class="loan-card-meta">Spłacono ${paidPct.toFixed(1)}% · ${formatPlnAmount(paidAmount)}</p>
    </div>`;
}

function renderArchivedLoanCardHtml(loan) {
    const archivedLabel = loan.archivedAt ? formatTxDate(loan.archivedAt) : '—';
    return `<div class="loan-archive-card loan-clickable" role="button" tabindex="0"
        onclick="openLoanDetails('${escapeHtml(loan.id)}')"
        onkeydown="if (event.key === 'Enter') openLoanDetails('${escapeHtml(loan.id)}')">
        <div class="loan-archive-card-head">
            <strong class="loan-archive-title">${escapeHtml(getLoanDisplayName(loan))}</strong>
            <span class="loan-archive-badge">Spłacony</span>
        </div>
        <p class="loan-archive-meta">Kwota: ${formatPlnAmount(loan.totalAmount)} · ${escapeHtml(loan.subCategory || '—')}</p>
        <p class="loan-archive-date">Zarchiwizowano: ${archivedLabel}</p>
    </div>`;
}

function populateAddLoanPaymentForm(loans = getActiveLoans()) {
    const select = document.getElementById('add-loan-payment-select');
    const dateInput = document.getElementById('add-loan-payment-date');
    if (!select) return;

    if (!loans.length) {
        select.innerHTML = '<option value="">— brak kredytów —</option>';
        select.disabled = true;
        return;
    }

    select.disabled = false;
    const current = activeLoanId && loans.some((l) => l.id === activeLoanId)
        ? activeLoanId
        : loans[0].id;
    select.innerHTML = loans.map((loan) =>
        `<option value="${escapeHtml(loan.id)}"${loan.id === current ? ' selected' : ''}>${escapeHtml(getLoanDisplayName(loan))}</option>`
    ).join('');

    if (dateInput && !dateInput.value) {
        dateInput.value = localIsoDate(new Date());
    }
    renderRecentCategories();
}

function registerLoanPayment(loanId, amount, date, note, options = {}) {
    const { advanceDueDate = false } = options;
    const loan = getLoanById(loanId);
    if (!loan || !isLoanActive(loan)) return null;
    if (!amount || amount <= 0) return null;

    let cashMovement = null;
    if (typeof syncCashForLoanPayment === 'function') {
        cashMovement = syncCashForLoanPayment(loanId, amount, date, note || 'Spłata kapitału');
        if (!cashMovement) return null;
    }

    const updates = {
        ...loan,
        currentCapitalLeft: Math.max(0, loan.currentCapitalLeft - amount)
    };
    if (advanceDueDate && loan.nextInstallmentDue) {
        updates.nextInstallmentDue = advanceLoanDueDate(loan.nextInstallmentDue);
    }

    updateLoanInState(updates);
    const updated = getLoanById(loan.id);

    const tx = {
        amount,
        type: 'expense',
        mainCategory: 'Długi',
        subCategory: loan.subCategory || 'Spłata',
        date,
        note: note || 'Spłata kapitału',
        affectsCash: true
    };
    if (cashMovement) tx.cashMovementId = cashMovement.id;
    appState.transactions.unshift(tx);

    appState.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    saveState();
    return updated;
}

function saveLoanPaymentFromAdd() {
    const loanId = document.getElementById('add-loan-payment-select')?.value;
    const loan = loanId ? getLoanById(loanId) : null;
    if (!loan || !isLoanActive(loan)) {
        alert('Wybierz aktywny kredyt do spłaty.');
        return;
    }

    const amount = parseFloat(document.getElementById('add-loan-payment-amount')?.value);
    const date = document.getElementById('add-loan-payment-date')?.value || localIsoDate(new Date());
    const note = document.getElementById('add-loan-payment-note')?.value.trim() || 'Spłata kapitału';

    if (!amount || amount <= 0) {
        alert('Podaj kwotę spłaty.');
        return;
    }
    if (amount > loan.currentCapitalLeft) {
        if (!confirm(`Kwota (${formatPlnAmount(amount)}) jest większa niż kapitał (${formatPlnAmount(loan.currentCapitalLeft)}). Kontynuować?`)) return;
    }

    const updated = registerLoanPayment(loanId, amount, date, note);
    if (!updated) return;

    addRecentLoan(loanId);

    hapticFeedback();
    if (updated.archived) {
        showSettingsToast('Kredyt spłacony — przeniesiony do archiwum');
        loansArchiveExpanded = true;
    } else {
        showSettingsToast('Spłata zarejestrowana');
    }

    document.getElementById('add-loan-payment-amount').value = '';
    document.getElementById('add-loan-payment-note').value = '';
    switchView('dashboard', 'Pulpit', document.querySelectorAll('.nav-item')[0]);
    refreshCurrentView();
}

function payLoanInstallment(loanId) {
    const loan = getLoanById(loanId);
    if (!loan || !isLoanActive(loan) || !loan.nextInstallmentAmount) return;

    const amount = loan.nextInstallmentAmount;
    const date = localIsoDate(new Date());
    const note = `Rata ${getLoanDisplayName(loan)}`;

    if (amount > loan.currentCapitalLeft) {
        if (!confirm(`Rata (${formatPlnAmount(amount)}) przekracza kapitał (${formatPlnAmount(loan.currentCapitalLeft)}). Kontynuować?`)) return;
    }

    const updated = registerLoanPayment(loanId, amount, date, note, { advanceDueDate: true });
    if (!updated) return;

    hapticFeedback();
    if (updated.archived) {
        showSettingsToast('Kredyt spłacony — przeniesiony do archiwum');
        loansArchiveExpanded = true;
    } else {
        showSettingsToast('Rata zapisana');
    }
    renderDashboard();
    refreshCurrentView();
}

function populateLoanForm(loan) {
    const nameInput = document.getElementById('loan-name-input');
    const subSelect = document.getElementById('loan-subcategory-select');
    const totalInput = document.getElementById('loan-total-input');
    const capitalInput = document.getElementById('loan-capital-input');
    const rateInput = document.getElementById('loan-rate-input');
    const installmentInput = document.getElementById('loan-installment-input');
    const installmentDueInput = document.getElementById('loan-installment-due-input');

    if (subSelect) {
        const subs = getLoanDebtSubcategories();
        const current = loan.subCategory || '';
        subSelect.innerHTML = [
            '<option value="">— wybierz podkategorię —</option>',
            ...subs.map((sub) => `<option value="${escapeHtml(sub)}"${sub === current ? ' selected' : ''}>${escapeHtml(sub)}</option>`)
        ].join('');
    }

    if (nameInput) nameInput.value = loan.name || '';
    if (totalInput) totalInput.value = loan.totalAmount > 0 ? loan.totalAmount : '';
    if (capitalInput) capitalInput.value = loan.currentCapitalLeft > 0 ? loan.currentCapitalLeft : '';
    if (rateInput) rateInput.value = loan.interestRate > 0 ? loan.interestRate : (loan.interestRate === 0 && isLoanConfigured(loan) ? 0 : '');
    if (installmentInput) installmentInput.value = loan.nextInstallmentAmount > 0 ? loan.nextInstallmentAmount : '';
    if (installmentDueInput) installmentDueInput.value = loan.nextInstallmentDue || '';
}

function saveLoanDetails() {
    const loan = getActiveLoan();
    const name = document.getElementById('loan-name-input')?.value.trim() || '';
    const subCategory = document.getElementById('loan-subcategory-select')?.value || '';
    let totalAmount = Math.max(0, parseFloat(document.getElementById('loan-total-input')?.value) || 0);
    let currentCapitalLeft = Math.max(0, parseFloat(document.getElementById('loan-capital-input')?.value) || 0);
    const interestRate = Math.max(0, parseFloat(document.getElementById('loan-rate-input')?.value) || 0);
    const nextInstallmentAmount = Math.max(0, parseFloat(document.getElementById('loan-installment-input')?.value) || 0);
    const nextInstallmentDue = document.getElementById('loan-installment-due-input')?.value || '';

    if (!totalAmount && !currentCapitalLeft) {
        alert('Podaj kwotę początkową lub pozostały kapitał.');
        return;
    }
    if (!totalAmount) totalAmount = currentCapitalLeft;
    if (!currentCapitalLeft) currentCapitalLeft = totalAmount;

    if (!subCategory) {
        alert('Wybierz podkategorię z listy Długi — łączy kredyt z transakcjami.');
        document.getElementById('loan-subcategory-select')?.focus();
        return;
    }
    if (currentCapitalLeft > totalAmount && totalAmount > 0) {
        alert('Pozostały kapitał nie może być większy niż kwota początkowa.');
        return;
    }

    const updated = updateLoanInState({
        ...loan,
        name: name || subCategory,
        subCategory,
        totalAmount,
        currentCapitalLeft,
        interestRate,
        nextInstallmentAmount,
        nextInstallmentDue
    });
    const wasNew = isDraftLoanActive();
    activeLoanId = updated.id;
    draftLoan = null;
    saveState();
    hapticFeedback();
    if (updated.archived) {
        showSettingsToast(wasNew ? 'Kredyt dodany' : 'Kredyt spłacony — przeniesiony do archiwum');
    } else {
        showSettingsToast(wasNew ? 'Kredyt dodany' : 'Dane kredytu zapisane');
    }
    renderLoans();
    refreshCurrentView();
    refreshLoanDetailsPanel();
    setLoanDetailsMode('view');
}

function renderLoanRecentPayments() {
    const list = document.getElementById('loan-payments-list');
    if (!list) return;

    const loans = getLoans().filter(isLoanConfigured);
    const filterLoan = loanPaymentsFilter !== 'all' ? getLoanById(loanPaymentsFilter) : null;
    const allPayments = appState.transactions
        .filter((t) => {
            if (!loans.some((loan) => transactionMatchesLoan(t, loan))) return false;
            if (!filterLoan) return true;
            return transactionMatchesLoan(t, filterLoan);
        })
        .sort((a, b) => b.date.localeCompare(a.date));

    const signature = `${loanPaymentsFilter}|${allPayments.length}|${allPayments[0]?.date ?? ''}`;
    if (signature !== loanPaymentsListSignature) {
        loanPaymentsListSignature = signature;
        loanPaymentsVisibleCount = LIST_PAGE_SIZE;
    }

    const payments = allPayments.slice(0, loanPaymentsVisibleCount);

    if (!allPayments.length) {
        const debtSubs = [...new Set(
            appState.transactions
                .filter((t) => t.type === 'expense' && t.mainCategory === 'Długi' && t.subCategory)
                .map((t) => t.subCategory)
        )];
        const hint = debtSubs.length
            ? `<p class="loan-payments-hint">W transakcjach (Długi): ${debtSubs.map((s) => escapeHtml(s)).join(', ')}</p>`
            : '';
        list.innerHTML = `<div class="empty-state loan-empty-payments"><p>Brak wpłat powiązanych z kredytami</p>${hint}</div>`;
        const moreBtn = document.getElementById('loan-payments-show-more');
        if (moreBtn) moreBtn.classList.add('hidden');
        return;
    }

    list.innerHTML = payments.map((t) => {
        const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
        const matchedLoan = loans.find((loan) => transactionMatchesLoan(t, loan));
        const loanLabel = matchedLoan ? getLoanDisplayName(matchedLoan) : '';
        return `<div class="loan-payment-row">
            <div class="loan-payment-text">
                <span class="loan-payment-title">${escapeHtml(title)}</span>
                <span class="loan-payment-meta">${formatTxDate(t.date)}${loanLabel ? ` · ${escapeHtml(loanLabel)}` : ''}${t.note ? ` · ${escapeHtml(t.note)}` : ''}</span>
            </div>
            <span class="loan-payment-amount">${formatPlnAmount(t.amount)}</span>
        </div>`;
    }).join('');

    const moreBtn = getOrCreateShowMoreButton('loan-payments-show-more', showMoreLoanPayments);
    updateShowMoreButton(moreBtn, allPayments.length, payments.length, list.parentElement, list);
}

function refreshLoanDetailsPanel() {
    const loan = getActiveLoan();
    const title = document.getElementById('loan-details-title');
    const content = document.getElementById('loan-details-content');
    const configured = isLoanConfigured(loan);
    if (title) {
        if (isDraftLoanActive()) title.textContent = 'Nowy kredyt';
        else title.textContent = configured
            ? getLoanDisplayName(loan)
            : (loanDetailsMode === 'edit' ? 'Konfiguracja kredytu' : 'Szczegóły kredytu');
    }
    if (content) {
        let html = configured && !isDraftLoanActive() ? renderLoanDetailsHtml(loan) : '';
        if (loan.archived && html) {
            const archivedOn = loan.archivedAt ? ` · ${formatTxDate(loan.archivedAt)}` : '';
            html = `<p class="loan-archive-notice">Spłacony i zarchiwizowany${archivedOn}. Ustaw kapitał &gt; 0 w edycji, aby przywrócić do aktywnych.</p>${html}`;
        }
        content.innerHTML = html;
    }
    populateLoanForm(loan);
}

function setLoanDetailsMode(mode) {
    const loan = getActiveLoan();
    const configured = isLoanConfigured(loan);
    loanDetailsMode = mode;

    const editBtn = document.getElementById('btn-loan-details-edit');
    const viewBtn = document.getElementById('btn-loan-details-view');
    const content = document.getElementById('loan-details-content');
    const editPanel = document.getElementById('loan-details-edit');

    if (mode === 'edit') {
        populateLoanForm(loan);
        if (editBtn) editBtn.classList.add('hidden');
        if (viewBtn) viewBtn.classList.toggle('hidden', !configured);
        if (content) content.classList.add('hidden');
        if (editPanel) editPanel.classList.remove('hidden');
        return;
    }

    loanDetailsMode = 'view';
    if (editBtn) editBtn.classList.toggle('hidden', !configured);
    if (viewBtn) viewBtn.classList.add('hidden');
    if (content) content.classList.toggle('hidden', !configured);
    if (editPanel) editPanel.classList.add('hidden');

    if (configured) {
        refreshLoanDetailsPanel();
    }
}

function cancelLoanEdit() {
    if (isDraftLoanActive()) {
        draftLoan = null;
        closeLoanDetails();
        return;
    }
    const loan = getActiveLoan();
    if (!isLoanConfigured(loan)) {
        closeLoanDetails();
        return;
    }
    setLoanDetailsMode('view');
}

function openNewLoan() {
    draftLoan = createDraftLoan();
    activeLoanId = draftLoan.id;

    const overlay = document.getElementById('loan-details-overlay');
    if (!overlay) return;

    refreshLoanDetailsPanel();
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setLoanDetailsMode('edit');
}

function openLoanDetails(loanId, mode) {
    migrateLoansArray();

    if (mode === 'edit' && !loanId) {
        openNewLoan();
        return;
    }

    draftLoan = null;

    if (loanId) {
        activeLoanId = loanId;
    } else if (!activeLoanId) {
        const loans = getLoans();
        activeLoanId = loans.find(isLoanConfigured)?.id || loans[0]?.id || null;
    }

    const overlay = document.getElementById('loan-details-overlay');
    if (!overlay) return;

    const loan = getActiveLoan();
    refreshLoanDetailsPanel();
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    if (mode === 'edit') {
        setLoanDetailsMode('edit');
    } else {
        setLoanDetailsMode(isLoanConfigured(loan) ? 'view' : 'edit');
    }
}

function closeLoanDetails() {
    document.getElementById('loan-details-overlay')?.classList.add('hidden');
    document.body.style.overflow = '';
    draftLoan = null;
    loanDetailsMode = 'view';
    setLoanDetailsMode('view');
}

function loanDetailRow(label, valueHtml) {
    if (valueHtml === null || valueHtml === undefined || valueHtml === '') return '';
    return `<div class="loan-detail-row"><span class="loan-detail-label">${escapeHtml(label)}</span><span class="loan-detail-value">${valueHtml}</span></div>`;
}

function loanDetailSection(title, rowsHtml, noteHtml = '') {
    if (!rowsHtml && !noteHtml) return '';
    return `<section class="loan-detail-section">
        <h3 class="loan-detail-section-title">${escapeHtml(title)}</h3>
        ${rowsHtml ? `<div class="loan-detail-rows">${rowsHtml}</div>` : ''}
        ${noteHtml ? `<p class="loan-detail-note">${noteHtml}</p>` : ''}
    </section>`;
}

function renderSimpleLoanDetailsHtml(loan) {
    const d = loan.details || {};
    const rateLabel = loan.interestRate
        ? `${loan.interestRate.toLocaleString('pl-PL', { maximumFractionDigits: 2 })}%${d.rateModel ? ` (${d.rateModel.toLowerCase()})` : ''}`
        : '';
    const rows = [
        loanDetailRow('Bank', d.bank),
        loanDetailRow('Numer umowy', d.contractNumber),
        loanDetailRow('Pozostało do spłaty', formatPlnAmount(loan.currentCapitalLeft)),
        loanDetailRow('Kwota początkowa', loan.totalAmount ? formatPlnAmount(loan.totalAmount) : ''),
        loanDetailRow('Oprocentowanie', rateLabel),
        loanDetailRow('Podkategoria', loan.subCategory),
        loanDetailRow('Pozostało rat', d.remainingInstallments ? String(d.remainingInstallments) : ''),
        loanDetailRow('Następna rata', loan.nextInstallmentAmount ? formatPlnAmount(loan.nextInstallmentAmount) : ''),
        loanDetailRow('Termin raty', loan.nextInstallmentDue ? formatTxDate(loan.nextInstallmentDue) : '')
    ].join('');

    let html = loanDetailSection('Parametry kredytu', rows);
    const note = d.overpaymentNotes
        || (loan.nextInstallmentAmount > 0 ? `Rata ${formatPlnAmount(loan.nextInstallmentAmount)} co miesiąc do pełnej spłaty.` : '');
    if (note) html += `<p class="loan-detail-note">${escapeHtml(note)}</p>`;
    return html;
}

function renderLoanDetailsHtml(loan) {
    if (!hasLoanExtendedDetails(loan)) {
        return renderSimpleLoanDetailsHtml(loan);
    }

    const d = loan.details || {};
    const asOf = d.asOfDate ? `<p class="loan-details-asof">Stan na ${formatTxDate(d.asOfDate)}</p>` : '';

    const contractRows = [
        loanDetailRow('Bank', d.bank),
        loanDetailRow('Numer umowy', d.contractNumber),
        loanDetailRow('Data zawarcia', d.contractDate ? formatTxDate(d.contractDate) : ''),
        loanDetailRow('Cel kredytu', d.purpose),
        loanDetailRow('Zabezpieczenie', d.collateral),
        loanDetailRow('Wycena nieruchomości', d.propertyValue ? formatPlnAmount(d.propertyValue) : ''),
        loanDetailRow('LTV na start', d.ltvPercent ? `${d.ltvPercent.toLocaleString('pl-PL', { maximumFractionDigits: 2 })}%` : '')
    ].join('');

    const financeRows = [
        loanDetailRow('Kwota kredytu brutto', loan.totalAmount ? formatPlnAmount(loan.totalAmount) : ''),
        loanDetailRow('Kapitał pozostały', formatPlnAmount(loan.currentCapitalLeft)),
        loanDetailRow('Całkowite zadłużenie', d.totalDebt ? formatPlnAmount(d.totalDebt) : ''),
        loanDetailRow('Kapitał spłacony', d.capitalPaid ? formatPlnAmount(d.capitalPaid) : ''),
        loanDetailRow('Odsetki spłacone', d.interestPaid ? formatPlnAmount(d.interestPaid) : ''),
        loanDetailRow('Koniec kredytu', d.endDate ? formatTxDate(d.endDate) : ''),
        loanDetailRow('Pozostało rat', d.remainingInstallments ? String(d.remainingInstallments) : ''),
        loanDetailRow('Następna rata', loan.nextInstallmentAmount ? formatPlnAmount(loan.nextInstallmentAmount) : ''),
        loanDetailRow('Termin raty', loan.nextInstallmentDue ? formatTxDate(loan.nextInstallmentDue) : '')
    ].join('');

    const rateRows = [
        loanDetailRow('Model', d.rateModel),
        loanDetailRow('Stała stopa do', d.rateFixedUntil ? formatTxDate(d.rateFixedUntil) : ''),
        loanDetailRow('Po okresie stałym', d.rateFutureModel),
        loanDetailRow('Aktualne oprocentowanie', loan.interestRate ? `${loan.interestRate.toLocaleString('pl-PL', { maximumFractionDigits: 2 })}%` : ''),
        loanDetailRow('Marża promocyjna', d.margin ? `${d.margin.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} p.p.` : '')
    ].join('');

    const securityRows = [
        loanDetailRow('Hipoteka umowna', d.mortgageLimit ? formatPlnAmount(d.mortgageLimit) : '')
    ].join('');

    const earlyFee = d.earlyRepaymentFee === null || d.earlyRepaymentFee === undefined
        ? ''
        : (d.earlyRepaymentFee === 0 ? '0%' : formatPlnAmount(d.earlyRepaymentFee));

    const repaymentRows = [
        loanDetailRow('Prowizja za wcześniejszą spłatę', earlyFee)
    ].join('');

    let html = asOf;
    html += loanDetailSection('Podstawowe dane umowy', contractRows);
    html += loanDetailSection('Parametry finansowe', financeRows);
    html += loanDetailSection('Oprocentowanie i marża', rateRows);
    if (d.promotionTerms) {
        html += loanDetailSection('Warunki promocyjne', '', escapeHtml(d.promotionTerms));
    }
    if (securityRows || d.lifeInsurance || d.propertyInsurance) {
        html += loanDetailSection('Zabezpieczenia', securityRows);
    }
    if (d.lifeInsurance) {
        html += loanDetailSection('Ubezpieczenie na życie', '', escapeHtml(d.lifeInsurance));
    }
    if (d.propertyInsurance) {
        html += loanDetailSection('Ubezpieczenie nieruchomości', '', escapeHtml(d.propertyInsurance));
    }
    html += loanDetailSection('Wcześniejsza spłata i nadpłaty', repaymentRows, d.overpaymentNotes ? escapeHtml(d.overpaymentNotes) : '');

    return html;
}
