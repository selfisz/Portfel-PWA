let activeViewId = 'dashboard';
let activeTransactionDetailsIndex = null;

function switchView(viewId, title, element) {
    if (activeViewId === 'dashboard' && viewId !== 'dashboard') {
        resetDashboardTxListPagination();
    }
    if (activeViewId === 'loans' && viewId !== 'loans') {
        resetLoanPaymentsListPagination();
    }
    activeViewId = viewId;

    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');
    document.getElementById('view-title').innerText = title;
    if (element) element.classList.add('active');

    if (viewId === 'dashboard') renderDashboard();
    if (viewId === 'reports') {
        if (typeof ensureAnalysisUIInit === 'function') ensureAnalysisUIInit();
        renderReports();
    }
    if (viewId === 'investments') renderInvestments();
    if (viewId === 'loans') renderLoans();

    if (viewId === 'add' && editingTxIndex === null) {
        document.getElementById('form-header').innerText = 'Nowa transakcja';
        document.getElementById('btn-cancel-edit').style.display = 'none';
        document.getElementById('recurring-wrapper').style.display = 'flex';
        document.getElementById('tx-amount').value = '';
        document.getElementById('tx-note').value = '';
        const _today = new Date();
        document.getElementById('tx-date').value = `${_today.getFullYear()}-${String(_today.getMonth() + 1).padStart(2, '0')}-${String(_today.getDate()).padStart(2, '0')}`;
        document.getElementById('tx-recurring').checked = false;
        const linkedAsset = document.getElementById('tx-linked-asset');
        if (linkedAsset) linkedAsset.checked = false;
        const ccCheckbox = document.getElementById('tx-credit-card');
        if (ccCheckbox) ccCheckbox.checked = false;
        const affectsCash = document.getElementById('tx-affects-cash');
        if (affectsCash) affectsCash.checked = true;
        onCreditCardPurchaseToggle();
        document.getElementById('btn-loan-payment')?.classList.remove('hidden');
        document.getElementById('btn-card-payment')?.classList.remove('hidden');
        const moreOpts = document.getElementById('add-form-more-options');
        if (moreOpts) moreOpts.open = false;
        const catPicker = document.getElementById('add-category-picker');
        if (catPicker) catPicker.open = false;
        setFormMode('expense');
        focusAmountField();
        if (typeof updateAddDateChipLabel === 'function') updateAddDateChipLabel();
        if (typeof initAddFormUi === 'function') initAddFormUi();
    }
}

function setAddFormPanels(mode) {
    const isLoan = mode === 'loan';
    const isCard = mode === 'card';
    const isStandard = mode === 'expense' || mode === 'income';

    document.getElementById('add-form-standard')?.classList.toggle('hidden', !isStandard);
    document.getElementById('add-form-loan')?.classList.toggle('hidden', !isLoan);
    document.getElementById('add-form-card')?.classList.toggle('hidden', !isCard);
    document.getElementById('add-sticky-standard')?.classList.toggle('hidden', !isStandard);
    document.getElementById('add-sticky-loan')?.classList.toggle('hidden', !isLoan);
    document.getElementById('add-sticky-card')?.classList.toggle('hidden', !isCard);
    if (typeof syncAddFormPanelsUi === 'function') syncAddFormPanelsUi(mode);
}

function setFormMode(mode) {
    if (editingTxIndex !== null && (mode === 'loan' || mode === 'card')) return;

    clearAddFormError();
    formState.formMode = mode;
    const isLoan = mode === 'loan';
    const isCard = mode === 'card';
    const isStandard = mode === 'expense' || mode === 'income';

    document.getElementById('btn-expense')?.classList.toggle('active', mode === 'expense');
    document.getElementById('btn-income')?.classList.toggle('active', mode === 'income');
    document.getElementById('btn-loan-payment')?.classList.toggle('active', isLoan);
    document.getElementById('btn-card-payment')?.classList.toggle('active', isCard);
    setAddFormPanels(mode);

    const recurringWrapper = document.getElementById('recurring-wrapper');
    const creditCardWrapper = document.getElementById('credit-card-purchase-wrapper');
    if (recurringWrapper) {
        recurringWrapper.style.display = !isStandard || editingTxIndex !== null ? 'none' : 'flex';
    }
    if (creditCardWrapper) {
        creditCardWrapper.style.display = !isStandard || editingTxIndex !== null || formState.currentType !== 'expense' ? 'none' : '';
    }

    if (isStandard) {
        setTransactionType(mode, true);
        document.getElementById('form-header').innerText = editingTxIndex !== null
            ? 'Edytuj transakcję'
            : 'Nowa transakcja';
        populateCreditCardSelectors();
        populateTransactionAssetSelect();
        updateAddFormCashHints();
        updateAddFormAmountStyle();
        return;
    }

    if (isLoan) {
        populateAddLoanPaymentForm();
        renderRecentCategories();
        document.getElementById('form-header').innerText = 'Spłata kredytu';
        return;
    }

    populateAddCreditCardForm();
    renderRecentCategories();
    document.getElementById('form-header').innerText = 'Operacja na karcie';
}

function setTransactionType(type, keepSelection = false) {
    formState.formMode = type;
    formState.currentType = type;
    document.getElementById('btn-expense').classList.toggle('active', type === 'expense');
    document.getElementById('btn-income').classList.toggle('active', type === 'income');
    document.getElementById('btn-loan-payment')?.classList.remove('active');
    document.getElementById('btn-card-payment')?.classList.remove('active');
    setAddFormPanels(type);
    const creditCardWrapper = document.getElementById('credit-card-purchase-wrapper');
    if (creditCardWrapper) {
        creditCardWrapper.style.display = type === 'expense' && editingTxIndex === null ? '' : 'none';
    }
    if (type === 'expense') {
        const ccCheckbox = document.getElementById('tx-credit-card');
        if (ccCheckbox && !ccCheckbox.checked) onCreditCardPurchaseToggle();
    }
    const affectsCash = document.getElementById('tx-affects-cash');
    if (affectsCash && editingTxIndex === null && type === 'expense') {
        affectsCash.checked = true;
    }
    if (!keepSelection) {
        formState.selectedMainCategory = '';
        formState.selectedSubCategory = '';
    }
    document.getElementById('sub-category-wrapper').style.display = 'none';
    renderMainCategoriesForm();
    updateAddFormAmountStyle();
    if (typeof updateTransactionBudgetPreview === 'function') updateTransactionBudgetPreview();
    if (typeof syncAddFormPanelsUi === 'function') syncAddFormPanelsUi(type);
}

function updateAddFormAmountStyle() {
    const input = document.getElementById('tx-amount');
    if (!input) return;
    input.classList.remove('tx-amount--expense', 'tx-amount--income');
    if (formState.currentType === 'income') {
        input.classList.add('tx-amount--income');
    } else if (formState.currentType === 'expense') {
        input.classList.add('tx-amount--expense');
    }
}

function resetStandardFormAfterSave() {
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-note').value = '';
    document.getElementById('tx-recurring').checked = false;
    const ccCheckbox = document.getElementById('tx-credit-card');
    if (ccCheckbox) ccCheckbox.checked = false;
    onCreditCardPurchaseToggle();
    const linkedAsset = document.getElementById('tx-linked-asset');
    if (linkedAsset) linkedAsset.checked = false;
    if (typeof updateTransactionAssetHints === 'function') updateTransactionAssetHints();
    const moreOpts = document.getElementById('add-form-more-options');
    if (moreOpts) moreOpts.open = false;
    const catPicker = document.getElementById('add-category-picker');
    if (catPicker) catPicker.open = false;
    clearAddFormError();
    updateAddFormCashHints();
    updateAddFormAmountStyle();
    if (typeof updateTransactionBudgetPreview === 'function') updateTransactionBudgetPreview();
    if (typeof updateAddCategorySummary === 'function') updateAddCategorySummary();
    if (typeof updateAddFormFooterSummary === 'function') updateAddFormFooterSummary();
    focusAmountField();
    renderDashboard();
}

function updateAddFormCashHints() {
    const incomeHint = document.getElementById('tx-income-cash-hint');
    const isIncome = formState.currentType === 'income';

    if (incomeHint) incomeHint.classList.toggle('hidden', !isIncome);
    updateTransactionAssetHints();
    if (typeof updateAddFormFooterSummary === 'function') updateAddFormFooterSummary();
}

function renderMainCategoriesForm() {
    const grid = document.getElementById('main-category-grid');
    grid.innerHTML = '';
    grid.classList.toggle('grid-selector--income', formState.currentType === 'income');
    Object.keys(categoryTree[formState.currentType]).forEach((cat) => {
        grid.appendChild(createMainCategoryItem(cat));
    });
    if (formState.selectedMainCategory) renderSubCategoriesForm(formState.selectedMainCategory);
    renderRecentCategories();
    populateTransactionAssetSelect();
    updateAddFormCashHints();
    if (typeof updateTransactionBudgetPreview === 'function') updateTransactionBudgetPreview();
    if (typeof updateAddCategorySummary === 'function') updateAddCategorySummary();
    if (typeof updateAddFormFooterSummary === 'function') updateAddFormFooterSummary();
}

function selectMainCategoryForm(cat, element) {
    clearAddFormError();
    document.querySelectorAll('#main-category-grid .grid-item').forEach((i) => i.classList.remove('selected'));
    if (element) element.classList.add('selected');
    formState.selectedMainCategory = cat;
    formState.selectedSubCategory = '';
    renderSubCategoriesForm(cat);
    renderRecentCategories();
    if (typeof updateTransactionBudgetPreview === 'function') updateTransactionBudgetPreview();
    if (typeof updateAddCategorySummary === 'function') updateAddCategorySummary();
    if (typeof updateAddFormFooterSummary === 'function') updateAddFormFooterSummary();
}

function renderSubCategoriesForm(cat) {
    const subs = categoryTree[formState.currentType][cat];
    const subWrapper = document.getElementById('sub-category-wrapper');
    const subGrid = document.getElementById('sub-category-grid');
    if (subs.length === 0) {
        subWrapper.style.display = 'none';
        formState.selectedSubCategory = '[Bez podkategorii]';
    } else {
        subGrid.innerHTML = '';
        subs.forEach((sub) => subGrid.appendChild(createSubCategoryItem(sub)));
        subWrapper.style.display = 'block';
        if (!subs.includes(formState.selectedSubCategory)) {
            formState.selectedSubCategory = '';
        }
    }
    renderRecentCategories();
    if (typeof updateAddCategorySummary === 'function') updateAddCategorySummary();
    if (typeof updateAddFormFooterSummary === 'function') updateAddFormFooterSummary();
}

function formatTransactionCategoryLabel(tx) {
    const sub = tx.subCategory === '[Bez podkategorii]' ? '' : tx.subCategory;
    return sub ? `${tx.mainCategory} · ${sub}` : tx.mainCategory;
}

function isPlannedTransaction(tx, referenceDate = new Date()) {
    if (!tx?.date) return false;
    return tx.date > localIsoDate(referenceDate);
}

function formatPlannedTransactionBadge() {
    return '<span class="forecast-plan-badge forecast-plan-badge--planned">zaplanowane</span>';
}

function formatTransactionSavedToast(tx, isEdit = false) {
    const sign = tx.type === 'expense' ? '−' : '+';
    const categoryLabel = formatTransactionCategoryLabel(tx);
    if (isEdit) {
        return `Zaktualizowano — ${categoryLabel} · ${sign}${formatPlnAmount(tx.amount)}`;
    }
    const verb = tx.type === 'expense' ? 'Wydatek zapisany' : 'Wpływ zapisany';
    return `${verb} — ${categoryLabel} · ${sign}${formatPlnAmount(tx.amount)}`;
}

function commitTransactionData(txData, options = {}) {
    let normalized = typeof normalizeTransaction === 'function'
        ? normalizeTransaction(txData)
        : null;
    if (!normalized) {
        return { ok: false, error: 'Nieprawidłowa transakcja.' };
    }
    if (typeof applyCategoryRulesToTransaction === 'function') {
        normalized = applyCategoryRulesToTransaction(normalized);
    }
    if (!options.skipBudgetConfirm && typeof confirmTransactionBudgetIfNeeded === 'function'
        && !confirmTransactionBudgetIfNeeded(normalized, null)) {
        return { ok: false, error: 'cancelled' };
    }

    appState.transactions.unshift(normalized);

    if (!syncCreditCardOnTransactionSave(normalized, null)) {
        appState.transactions.shift();
        return { ok: false, error: 'Nie zapisano — problem z kartą kredytową.' };
    }
    if (!syncCashOnTransactionSave(normalized, null)) {
        syncCreditCardOnTransactionSave({}, normalized);
        appState.transactions.shift();
        return { ok: false, error: 'Nie zapisano — brak zmiany salda gotówki.' };
    }
    if (!syncAssetOnTransactionSave(normalized, null)) {
        syncCashOnTransactionSave({}, normalized);
        syncCreditCardOnTransactionSave({}, normalized);
        appState.transactions.shift();
        return { ok: false, error: 'Nie zapisano — problem z powiązanym aktywem.' };
    }

    addRecentCategory(normalized.type, normalized.mainCategory, normalized.subCategory);
    appState.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    saveState();
    if (typeof notifyAfterFinanceChange === 'function') notifyAfterFinanceChange();
    return { ok: true, tx: normalized };
}

async function saveTransaction() {
    const amount = parsePlnInput(document.getElementById('tx-amount').value);
    const date = document.getElementById('tx-date').value;
    const note = document.getElementById('tx-note').value;
    const isRecurring = document.getElementById('tx-recurring').checked;
    const paidWithCard = document.getElementById('tx-credit-card')?.checked;
    const creditCardId = document.getElementById('tx-credit-card-select')?.value;
    const affectsCashChecked = document.getElementById('tx-affects-cash')?.checked ?? true;

    if (!Number.isFinite(amount) || amount <= 0 || !formState.selectedMainCategory || !formState.selectedSubCategory || !date) {
        showAddFormError('Uzupełnij kwotę, kategorię i datę.');
        if (!formState.selectedMainCategory || !formState.selectedSubCategory) {
            if (typeof focusAddCategorySearch === 'function') focusAddCategorySearch();
        }
        return;
    }

    clearAddFormError();

    const affectsCash = resolveTransactionAffectsCash(
        formState.currentType,
        !!(paidWithCard && formState.currentType === 'expense'),
        affectsCashChecked
    );

    const linkedAssetChecked = document.getElementById('tx-linked-asset')?.checked;
    const linkedAssetId = linkedAssetChecked
        ? (document.getElementById('tx-linked-asset-select')?.value || '')
        : '';

    const txData = {
        amount,
        type: formState.currentType,
        mainCategory: formState.selectedMainCategory,
        subCategory: formState.selectedSubCategory,
        date,
        note,
        affectsCash: linkedAssetId && formState.currentType === 'income' ? false : affectsCash
    };

    if (linkedAssetId) txData.linkedAssetId = linkedAssetId;
    if (linkedAssetChecked && !linkedAssetId) {
        showAddFormError('Wybierz aktywo lub odznacz powiązanie.');
        return;
    }

    if (typeof applyCategoryRulesToTransaction === 'function') {
        const ruled = applyCategoryRulesToTransaction(txData);
        txData.mainCategory = ruled.mainCategory;
        txData.subCategory = ruled.subCategory;
    }

    if (paidWithCard && formState.currentType === 'expense') {
        if (!creditCardId) {
            showAddFormError('Wybierz kartę kredytową.');
            return;
        }
        txData.creditCardId = creditCardId;
    }

    const split = typeof shouldOfferTransactionSplit === 'function'
        ? shouldOfferTransactionSplit(note, amount, editingTxIndex)
        : null;
    if (split) {
        if (typeof confirmTransactionBudgetIfNeeded === 'function' && !confirmTransactionBudgetIfNeeded(txData, null)) {
            return;
        }
        const parts = typeof buildSplitTransactions === 'function'
            ? buildSplitTransactions(txData, split)
            : [];
        const result = typeof commitMultipleTransactions === 'function'
            ? commitMultipleTransactions(parts, { skipBudgetConfirm: true })
            : { ok: false, error: 'Brak obsługi podziału.' };
        if (!result.ok) {
            if (result.error && result.error !== 'cancelled') {
                showAppToast(result.error, 'error');
            }
            return;
        }
        hapticFeedback();
        showAppToast(`Zapisano ${result.txs.length} transakcje`, 'success');
        if (typeof notifyAfterFinanceChange === 'function') notifyAfterFinanceChange();
        resetStandardFormAfterSave();
        return;
    }

    const previousTx = editingTxIndex !== null ? { ...appState.transactions[editingTxIndex] } : null;
    if (typeof confirmTransactionBudgetIfNeeded === 'function' && !confirmTransactionBudgetIfNeeded(txData, previousTx)) {
        return;
    }
    const savedEditingIndex = editingTxIndex;

    if (editingTxIndex !== null) {
        if (appState.transactions[editingTxIndex].recurringId) {
            txData.recurringId = appState.transactions[editingTxIndex].recurringId;
        }
        appState.transactions[editingTxIndex] = txData;
        editingTxIndex = null;
    } else {
        if (typeof confirmNoDuplicateBeforeSave === 'function') {
            const allowDuplicate = await confirmNoDuplicateBeforeSave(txData, null);
            if (!allowDuplicate) return;
        }
        if (isRecurring) txData.recurringId = 'rec_' + Date.now();
        appState.transactions.unshift(txData);
    }

    syncCreditCardOnTransactionSave(txData, previousTx);
    if (!syncCashOnTransactionSave(txData, previousTx)) {
        syncCreditCardOnTransactionSave(previousTx || {}, txData);
        if (savedEditingIndex !== null && previousTx) {
            appState.transactions[savedEditingIndex] = previousTx;
        } else {
            appState.transactions.shift();
        }
        showAppToast('Nie zapisano — brak zmiany salda gotówki.', 'error');
        return;
    }
    if (!syncAssetOnTransactionSave(txData, previousTx)) {
        syncCashOnTransactionSave(previousTx || {}, txData);
        syncCreditCardOnTransactionSave(previousTx || {}, txData);
        if (savedEditingIndex !== null && previousTx) {
            appState.transactions[savedEditingIndex] = previousTx;
        } else {
            appState.transactions.shift();
        }
        showAppToast('Nie zapisano — brak zmiany powiązanego aktywa.', 'error');
        return;
    }
    const wasEdit = savedEditingIndex !== null;
    addRecentCategory(txData.type, txData.mainCategory, txData.subCategory);
    appState.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    saveState();
    hapticFeedback();
    showAppToast(formatTransactionSavedToast(txData, wasEdit), 'success');
    if (typeof notifyAfterFinanceChange === 'function') notifyAfterFinanceChange();
    if (wasEdit) {
        const returnAssetId = postEditReturnAssetId;
        postEditReturnAssetId = null;
        if (returnAssetId && typeof returnToAssetAfterEdit === 'function') {
            returnToAssetAfterEdit(returnAssetId);
        } else {
            switchView('dashboard', 'Pulpit', document.querySelectorAll('.nav-item')[0]);
        }
    } else {
        resetStandardFormAfterSave();
    }
}

function getTransactionDetailTitle(tx) {
    if (!tx) return 'Transakcja';
    return tx.subCategory === '[Bez podkategorii]' ? tx.mainCategory : tx.subCategory;
}

function getTransactionCashEffectLabel(tx) {
    if (!tx) return '';
    if (tx.type === 'income') return 'Tak — wpływ do gotówki';
    if (tx.creditCardId) return 'Nie — zakup na karcie';
    if (tx.cashMovementId || tx.affectsCash === true) return 'Tak — obciąża gotówkę';
    return 'Nie — bez wpływu na gotówkę';
}

function renderTransactionDetailsHtml(tx) {
    if (!tx) return '';
    const row = typeof loanDetailRow === 'function'
        ? loanDetailRow
        : (label, value) => (value ? `<div class="loan-detail-row"><span class="loan-detail-label">${escapeHtml(label)}</span><span class="loan-detail-value">${value}</span></div>` : '');

    const typeLabel = tx.type === 'income' ? 'Wpływ' : 'Wydatek';
    const amountClass = tx.type === 'income' ? 'income' : 'expense';
    const sign = tx.type === 'expense' ? '−' : '+';
    const subLabel = tx.subCategory === '[Bez podkategorii]' ? '—' : tx.subCategory;

    let cardLabel = '';
    if (tx.creditCardId && typeof getCreditCardById === 'function') {
        const card = getCreditCardById(tx.creditCardId);
        cardLabel = card?.name || 'Karta kredytowa';
    }

    let assetLabel = '';
    if (tx.linkedAssetId && typeof getAssetById === 'function') {
        const asset = getAssetById(tx.linkedAssetId);
        assetLabel = asset?.name || 'Powiązane aktywo';
    }

    const rows = [
        row('Data', formatTxDate(tx.date)),
        row('Typ', typeLabel),
        row('Kategoria', tx.mainCategory),
        row('Podkategoria', subLabel),
        row('Notatka', tx.note ? escapeHtml(tx.note) : ''),
        row('Karta kredytowa', cardLabel ? escapeHtml(cardLabel) : ''),
        row('Powiązane aktywo', assetLabel ? escapeHtml(assetLabel) : ''),
        row('Gotówka', getTransactionCashEffectLabel(tx)),
        row('Powtarzalna', tx.recurringId ? 'Tak' : '')
    ].join('');

    return `<p class="transaction-details-amount ${amountClass}">${sign}${formatPlnAmount(tx.amount)}</p>
        <div class="loan-details-grid">${rows}</div>`;
}

function refreshTransactionDetailsPanel() {
    const tx = activeTransactionDetailsIndex !== null
        ? appState.transactions[activeTransactionDetailsIndex]
        : null;
    const title = document.getElementById('transaction-details-title');
    const content = document.getElementById('transaction-details-content');
    const viewBtn = document.getElementById('btn-transaction-details-view');
    if (title) title.textContent = getTransactionDetailTitle(tx);
    if (content) content.innerHTML = tx ? renderTransactionDetailsHtml(tx) : '';
    if (viewBtn) viewBtn.classList.add('hidden');
}

function openTransactionDetails(index) {
    const tx = appState.transactions[index];
    if (!tx) return;
    activeTransactionDetailsIndex = index;
    const overlay = document.getElementById('transaction-details-overlay');
    if (!overlay) return;
    refreshTransactionDetailsPanel();
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeTransactionDetails() {
    const overlay = document.getElementById('transaction-details-overlay');
    overlay?.classList.add('hidden');
    if (overlay) delete overlay.dataset.monthCloseContext;
    activeTransactionDetailsIndex = null;
    const scrollLocked = [
        'month-close-overlay',
        'reports-pdf-overlay',
        'duplicate-tx-overlay',
        'assets-pdf-date-overlay',
        'debts-pdf-date-overlay'
    ].some((id) => !document.getElementById(id)?.classList.contains('hidden'));
    if (!scrollLocked) document.body.style.overflow = '';
    if (typeof monthCloseWizardMonthKey !== 'undefined' && monthCloseWizardMonthKey && typeof renderMonthCloseWizard === 'function') {
        renderMonthCloseWizard();
    }
}

function editTransactionFromDetails() {
    const index = activeTransactionDetailsIndex;
    closeTransactionDetails();
    if (index !== null && index >= 0) editTransaction(index);
}

function editTransaction(index) {
    const tx = appState.transactions[index];
    editingTxIndex = index;
    document.getElementById('form-header').innerText = 'Edytuj transakcję';
    document.getElementById('btn-cancel-edit').style.display = 'block';
    document.getElementById('recurring-wrapper').style.display = 'none';
    document.getElementById('credit-card-purchase-wrapper').style.display = tx.type === 'expense' ? '' : 'none';
    document.getElementById('btn-loan-payment')?.classList.add('hidden');
    document.getElementById('btn-card-payment')?.classList.add('hidden');
    document.getElementById('tx-amount').value = tx.amount;
    document.getElementById('tx-date').value = tx.date;
    document.getElementById('tx-note').value = tx.note || '';
    const ccCheckbox = document.getElementById('tx-credit-card');
    if (ccCheckbox) {
        ccCheckbox.checked = !!(tx.creditCardId && tx.type === 'expense');
        populateCreditCardSelectors();
        if (tx.creditCardId) {
            const select = document.getElementById('tx-credit-card-select');
            if (select) select.value = tx.creditCardId;
        }
        onCreditCardPurchaseToggle();
    }
    const affectsCash = document.getElementById('tx-affects-cash');
    if (affectsCash) {
        if (tx.type === 'income') {
            affectsCash.checked = true;
        } else {
            affectsCash.checked = !tx.creditCardId && (tx.cashMovementId ? true : tx.affectsCash === true);
        }
    }
    const linkedAsset = document.getElementById('tx-linked-asset');
    const linkedSelect = document.getElementById('tx-linked-asset-select');
    populateTransactionAssetSelect();
    if (linkedAsset) linkedAsset.checked = !!tx.linkedAssetId;
    if (linkedSelect && tx.linkedAssetId) linkedSelect.value = tx.linkedAssetId;
    updateAddFormCashHints();
    if (typeof syncAddPaymentMethodUi === 'function') syncAddPaymentMethodUi();
    const moreOpts = document.getElementById('add-form-more-options');
    if (moreOpts) moreOpts.open = !!tx.linkedAssetId;
    formState.selectedMainCategory = tx.mainCategory;
    formState.selectedSubCategory = tx.subCategory;
    setFormMode(tx.type);
    switchView('add', 'Edytuj', document.querySelectorAll('.nav-item')[1]);
    if (typeof updateAddDateChipLabel === 'function') updateAddDateChipLabel();
    if (typeof syncAddPaymentMethodUi === 'function') syncAddPaymentMethodUi();
    if (typeof updateAddCategorySummary === 'function') updateAddCategorySummary();
    if (typeof updateAddFormFooterSummary === 'function') updateAddFormFooterSummary();
    focusAmountField();
}

function removeCommittedTransaction(txRef) {
    const idx = appState.transactions.findIndex((item) => item === txRef);
    if (idx < 0) return;
    const tx = appState.transactions[idx];
    syncCreditCardOnTransactionDelete(tx);
    syncCashOnTransactionDelete(tx);
    syncAssetOnTransactionDelete(tx);
    appState.transactions.splice(idx, 1);
}

function undoDeleteTransaction(snapshot) {
    if (!snapshot?.tx) return;
    const restored = { ...snapshot.tx };
    delete restored.cashMovementId;

    const insertAt = Math.min(Math.max(0, snapshot.index), appState.transactions.length);
    appState.transactions.splice(insertAt, 0, restored);

    if (!syncCreditCardOnTransactionSave(restored, null)
        || !syncCashOnTransactionSave(restored, null)
        || !syncAssetOnTransactionSave(restored, null)) {
        appState.transactions.splice(insertAt, 1);
        if (typeof showAppToast === 'function') showAppToast('Nie udało się przywrócić transakcji.', 'error');
        return;
    }

    appState.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    saveState();
    renderDashboard();
    if (typeof notifyAfterFinanceChange === 'function') notifyAfterFinanceChange();
    if (typeof showAppToast === 'function') showAppToast('Przywrócono transakcję');
}

function deleteTransaction(index) {
    const tx = appState.transactions[index];
    if (!tx) return;

    const snapshot = {
        index,
        tx: JSON.parse(JSON.stringify(tx))
    };

    if (activeTransactionDetailsIndex === index) closeTransactionDetails();
    syncCreditCardOnTransactionDelete(tx);
    syncCashOnTransactionDelete(tx);
    syncAssetOnTransactionDelete(tx);
    appState.transactions.splice(index, 1);
    saveState();
    renderDashboard();
    if (typeof notifyAfterFinanceChange === 'function') notifyAfterFinanceChange();

    if (typeof showUndoToast === 'function') {
        showUndoToast('Usunięto transakcję', () => undoDeleteTransaction(snapshot));
    }
}

function cancelEdit() {
    editingTxIndex = null;
    const returnAssetId = postEditReturnAssetId;
    postEditReturnAssetId = null;
    if (returnAssetId && typeof returnToAssetAfterEdit === 'function') {
        returnToAssetAfterEdit(returnAssetId);
    } else {
        switchView('dashboard', 'Pulpit', document.querySelectorAll('.nav-item')[0]);
    }
}
