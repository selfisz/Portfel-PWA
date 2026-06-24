let activeViewId = 'dashboard';

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
    if (viewId === 'reports') renderReports();
    if (viewId === 'investments') renderInvestments();
    if (viewId === 'loans') renderLoans();

    if (viewId === 'add' && editingTxIndex === null) {
        document.getElementById('form-header').innerText = 'Nowa transakcja';
        document.getElementById('btn-cancel-edit').style.display = 'none';
        document.getElementById('recurring-wrapper').style.display = 'flex';
        document.getElementById('tx-amount').value = '';
        document.getElementById('tx-note').value = '';
        document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
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
        setFormMode('expense');
        focusAmountField();
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
}

function setFormMode(mode) {
    if (editingTxIndex !== null && (mode === 'loan' || mode === 'card')) return;

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
        creditCardWrapper.style.display = !isStandard || editingTxIndex !== null || formState.currentType !== 'expense' ? 'none' : 'block';
    }

    if (isStandard) {
        setTransactionType(mode, true);
        document.getElementById('form-header').innerText = editingTxIndex !== null
            ? 'Edytuj transakcję'
            : 'Nowa transakcja';
        populateCreditCardSelectors();
        populateTransactionAssetSelect();
        updateAddFormCashHints();
        return;
    }

    if (isLoan) {
        populateAddLoanPaymentForm();
        document.getElementById('form-header').innerText = 'Spłata kredytu';
        return;
    }

    populateAddCreditCardForm();
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
        creditCardWrapper.style.display = type === 'expense' && editingTxIndex === null ? 'block' : 'none';
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
}

function updateAddFormCashHints() {
    const incomeHint = document.getElementById('tx-income-cash-hint');
    const affectsWrap = document.getElementById('tx-affects-cash-wrapper');
    const isIncome = formState.currentType === 'income';
    const paidWithCard = document.getElementById('tx-credit-card')?.checked;

    if (incomeHint) incomeHint.classList.toggle('hidden', !isIncome);
    if (affectsWrap) affectsWrap.classList.toggle('hidden', isIncome || !!paidWithCard);
    updateTransactionAssetHints();
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
}

function selectMainCategoryForm(cat, element) {
    document.querySelectorAll('#main-category-grid .grid-item').forEach((i) => i.classList.remove('selected'));
    if (element) element.classList.add('selected');
    formState.selectedMainCategory = cat;
    formState.selectedSubCategory = '';
    renderSubCategoriesForm(cat);
    renderRecentCategories();
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
}

function saveTransaction() {
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const date = document.getElementById('tx-date').value;
    const note = document.getElementById('tx-note').value;
    const isRecurring = document.getElementById('tx-recurring').checked;
    const paidWithCard = document.getElementById('tx-credit-card')?.checked;
    const creditCardId = document.getElementById('tx-credit-card-select')?.value;
    const affectsCashChecked = document.getElementById('tx-affects-cash')?.checked ?? true;

    if (!amount || !formState.selectedMainCategory || !formState.selectedSubCategory || !date) {
        return alert('Uzupełnij kwotę i kategorie.');
    }

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
        return alert('Wybierz aktywo lub odznacz powiązanie.');
    }

    if (paidWithCard && formState.currentType === 'expense') {
        if (!creditCardId) return alert('Wybierz kartę kredytową.');
        txData.creditCardId = creditCardId;
    }

    const previousTx = editingTxIndex !== null ? { ...appState.transactions[editingTxIndex] } : null;

    if (editingTxIndex !== null) {
        if (appState.transactions[editingTxIndex].recurringId) {
            txData.recurringId = appState.transactions[editingTxIndex].recurringId;
        }
        appState.transactions[editingTxIndex] = txData;
        editingTxIndex = null;
    } else {
        if (isRecurring) txData.recurringId = 'rec_' + Date.now();
        appState.transactions.unshift(txData);
    }

    syncCreditCardOnTransactionSave(txData, previousTx);
    if (!syncCashOnTransactionSave(txData, previousTx)) {
        syncCreditCardOnTransactionSave(previousTx || {}, txData);
        if (editingTxIndex !== null && previousTx) {
            appState.transactions[editingTxIndex] = previousTx;
        } else {
            appState.transactions.shift();
        }
        return alert('Anulowano — nie zmieniono salda gotówki.');
    }
    if (!syncAssetOnTransactionSave(txData, previousTx)) {
        syncCashOnTransactionSave(previousTx || {}, txData);
        syncCreditCardOnTransactionSave(previousTx || {}, txData);
        if (editingTxIndex !== null && previousTx) {
            appState.transactions[editingTxIndex] = previousTx;
        } else {
            appState.transactions.shift();
        }
        return alert('Anulowano — nie zmieniono aktywa.');
    }
    addRecentCategory(txData.type, txData.mainCategory, txData.subCategory);
    appState.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    saveState();
    hapticFeedback();
    switchView('dashboard', 'Pulpit', document.querySelectorAll('.nav-item')[0]);
}

function editTransaction(index) {
    const tx = appState.transactions[index];
    editingTxIndex = index;
    document.getElementById('form-header').innerText = 'Edytuj transakcję';
    document.getElementById('btn-cancel-edit').style.display = 'block';
    document.getElementById('recurring-wrapper').style.display = 'none';
    document.getElementById('credit-card-purchase-wrapper').style.display = tx.type === 'expense' ? 'block' : 'none';
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
    formState.selectedMainCategory = tx.mainCategory;
    formState.selectedSubCategory = tx.subCategory;
    setFormMode(tx.type);
    switchView('add', 'Edytuj', document.querySelectorAll('.nav-item')[1]);
    focusAmountField();
}

function deleteTransaction(index) {
    if (confirm('Na pewno usunąć?')) {
        const tx = appState.transactions[index];
        syncCreditCardOnTransactionDelete(tx);
        syncCashOnTransactionDelete(tx);
        syncAssetOnTransactionDelete(tx);
        appState.transactions.splice(index, 1);
        saveState();
        renderDashboard();
    }
}

function cancelEdit() {
    editingTxIndex = null;
    switchView('dashboard', 'Pulpit', document.querySelectorAll('.nav-item')[0]);
}
