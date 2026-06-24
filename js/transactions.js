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
        document.getElementById('btn-loan-payment')?.classList.remove('hidden');
        setFormMode('expense');
        focusAmountField();
    }
}

function setFormMode(mode) {
    if (editingTxIndex !== null && mode === 'loan') return;

    const isLoan = mode === 'loan';
    formState.formMode = mode;

    document.getElementById('btn-expense')?.classList.toggle('active', mode === 'expense');
    document.getElementById('btn-income')?.classList.toggle('active', mode === 'income');
    document.getElementById('btn-loan-payment')?.classList.toggle('active', mode === 'loan');
    document.getElementById('add-form-standard')?.classList.toggle('hidden', isLoan);
    document.getElementById('add-form-loan')?.classList.toggle('hidden', !isLoan);
    document.getElementById('add-sticky-standard')?.classList.toggle('hidden', isLoan);
    document.getElementById('add-sticky-loan')?.classList.toggle('hidden', !isLoan);

    const recurringWrapper = document.getElementById('recurring-wrapper');
    if (recurringWrapper) {
        recurringWrapper.style.display = isLoan || editingTxIndex !== null ? 'none' : 'flex';
    }

    if (mode === 'expense' || mode === 'income') {
        setTransactionType(mode, true);
        document.getElementById('form-header').innerText = editingTxIndex !== null
            ? 'Edytuj transakcję'
            : 'Nowa transakcja';
        return;
    }

    populateAddLoanPaymentForm();
    document.getElementById('form-header').innerText = 'Spłata kredytu';
}

function setTransactionType(type, keepSelection = false) {
    formState.formMode = type;
    formState.currentType = type;
    document.getElementById('btn-expense').classList.toggle('active', type === 'expense');
    document.getElementById('btn-income').classList.toggle('active', type === 'income');
    document.getElementById('btn-loan-payment')?.classList.remove('active');
    document.getElementById('add-form-standard')?.classList.remove('hidden');
    document.getElementById('add-form-loan')?.classList.add('hidden');
    if (!keepSelection) {
        formState.selectedMainCategory = '';
        formState.selectedSubCategory = '';
    }
    document.getElementById('sub-category-wrapper').style.display = 'none';
    renderMainCategoriesForm();
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

    if (!amount || !formState.selectedMainCategory || !formState.selectedSubCategory || !date) {
        return alert('Uzupełnij kwotę i kategorie.');
    }

    const txData = {
        amount,
        type: formState.currentType,
        mainCategory: formState.selectedMainCategory,
        subCategory: formState.selectedSubCategory,
        date,
        note
    };

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
    document.getElementById('btn-loan-payment')?.classList.add('hidden');
    document.getElementById('tx-amount').value = tx.amount;
    document.getElementById('tx-date').value = tx.date;
    document.getElementById('tx-note').value = tx.note || '';
    formState.selectedMainCategory = tx.mainCategory;
    formState.selectedSubCategory = tx.subCategory;
    setFormMode(tx.type);
    switchView('add', 'Edytuj', document.querySelectorAll('.nav-item')[1]);
    focusAmountField();
}

function deleteTransaction(index) {
    if (confirm('Na pewno usunąć?')) {
        appState.transactions.splice(index, 1);
        saveState();
        renderDashboard();
    }
}

function cancelEdit() {
    editingTxIndex = null;
    switchView('dashboard', 'Pulpit', document.querySelectorAll('.nav-item')[0]);
}
