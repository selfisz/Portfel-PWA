function formatAddDateChipLabel(dateStr) {
    if (!dateStr) return 'Data';
    const today = localIsoDate(new Date());
    if (dateStr === today) return 'Dziś';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (Number.isNaN(d.getTime())) return dateStr;
    const months = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
}

function updateAddDateChipLabel() {
    const input = document.getElementById('tx-date');
    const label = document.getElementById('add-date-chip-label');
    if (!input || !label) return;
    label.textContent = formatAddDateChipLabel(input.value);
}

function getAddFormCategoryLabel() {
    const main = formState.selectedMainCategory;
    if (!main) return '';
    const sub = formState.selectedSubCategory;
    if (!sub || sub === '[Bez podkategorii]') return main;
    return `${main} · ${sub}`;
}

function hasAddFormRecentCategories() {
    const wrapper = document.getElementById('recent-categories-wrapper');
    return !!(wrapper && wrapper.style.display !== 'none');
}

function updateCategoryGridsVisibility() {
    const gridsWrap = document.getElementById('add-category-grids-wrap');
    const picker = document.getElementById('add-category-picker');
    if (!gridsWrap) return;
    const show = !!picker?.open || !hasAddFormRecentCategories();
    gridsWrap.classList.toggle('hidden', !show);
}

function focusAddCategorySearch(options = {}) {
    const section = document.getElementById('add-category-section');
    const input = document.getElementById('add-category-search');
    if (!input) return;
    if (options.scroll !== false) {
        section?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    requestAnimationFrame(() => {
        input.focus();
        if (typeof input.select === 'function' && input.value) input.select();
    });
}

function openAddCategoryBrowse() {
    const picker = document.getElementById('add-category-picker');
    if (picker) picker.open = true;
    clearAddCategorySearch();
    updateCategoryGridsVisibility();
    clearAddFormError();
}

function closeAddCategoryBrowse() {
    const picker = document.getElementById('add-category-picker');
    if (picker) picker.open = false;
    updateCategoryGridsVisibility();
}

function updateAddCategorySummary() {
    const summary = document.getElementById('add-category-summary');
    const selectedBtn = document.getElementById('add-category-selected-btn');
    if (!summary) return;

    const label = getAddFormCategoryLabel();
    summary.textContent = label || 'Wybierz kategorię';
    summary.classList.toggle('add-category-summary-text--selected', !!label);
    selectedBtn?.classList.toggle('add-category-selected-btn--selected', !!label);

    const subs = formState.selectedMainCategory
        ? (categoryTree[formState.currentType]?.[formState.selectedMainCategory] || [])
        : [];
    const needsSub = subs.length > 0;
    const subReady = !needsSub || !!formState.selectedSubCategory;
    if (label && subReady && editingTxIndex === null && hasAddFormRecentCategories()) {
        closeAddCategoryBrowse();
    }
}

function updateAddCategoryBrowseUi(options = {}) {
    const browseBtn = document.getElementById('add-category-browse-btn');
    const picker = document.getElementById('add-category-picker');
    const hasRecents = hasAddFormRecentCategories();

    browseBtn?.classList.toggle('hidden', !hasRecents);

    if (!picker) return;

    if (editingTxIndex !== null) {
        picker.open = true;
    } else if (!hasRecents) {
        picker.open = true;
        const onAddView = document.getElementById('view-add')?.classList.contains('active');
        if (options.autoFocus && onAddView) focusAddCategorySearch({ scroll: false });
    } else if (!picker.open) {
        picker.open = false;
    }

    updateCategoryGridsVisibility();
    renderAddCategorySearchResults(document.getElementById('add-category-search')?.value || '');
}

function appendAddFooterPart(container, text, className) {
    const span = document.createElement('span');
    span.className = className || 'add-footer-part';
    span.textContent = text;
    container.appendChild(span);
}

function appendAddFooterSeparator(container) {
    appendAddFooterPart(container, '·', 'add-footer-sep');
}

function updateAddFormFooterSummary() {
    const el = document.getElementById('add-footer-summary');
    if (!el) return;

    const mode = formState.formMode;
    if (mode === 'loan' || mode === 'card') {
        el.textContent = '';
        el.classList.add('hidden');
        return;
    }

    el.classList.remove('hidden');
    const amountRaw = document.getElementById('tx-amount')?.value?.trim();
    const amount = amountRaw ? parsePlnInput(amountRaw) : NaN;
    const hasAmount = Number.isFinite(amount) && amount > 0;
    const category = getAddFormCategoryLabel();
    const dateLabel = formatAddDateChipLabel(document.getElementById('tx-date')?.value);
    const sign = formState.currentType === 'income' ? '+' : '−';

    el.innerHTML = '';
    el.classList.toggle('add-footer-summary--ready', hasAmount && !!category);

    if (!hasAmount && !category) {
        el.textContent = 'Wpisz kwotę i wybierz kategorię';
        return;
    }

    let first = true;
    if (hasAmount) {
        appendAddFooterPart(el, `${sign}${formatPlnAmount(amount)}`, 'add-footer-part add-footer-amount');
        first = false;
    }

    const catBtn = document.createElement('button');
    catBtn.type = 'button';
    catBtn.className = 'add-footer-category-btn';
    catBtn.textContent = category || 'Wybierz kategorię';
    catBtn.onclick = () => focusAddCategorySearch();
    if (!first) appendAddFooterSeparator(el);
    el.appendChild(catBtn);
    first = false;

    if (dateLabel) {
        if (!first) appendAddFooterSeparator(el);
        appendAddFooterPart(el, dateLabel, 'add-footer-part add-footer-date');
    }
}

function setAddPaymentMethod(method) {
    const cardCb = document.getElementById('tx-credit-card');
    const cashCb = document.getElementById('tx-affects-cash');
    if (!cardCb || !cashCb) return;

    const isCard = method === 'card';
    cardCb.checked = isCard;
    cashCb.checked = !isCard;
    onCreditCardPurchaseToggle();
    updateAddFormCashHints();
    updateAddFormFooterSummary();
}

function syncAddPaymentMethodUi() {
    const isCard = !!document.getElementById('tx-credit-card')?.checked;
    document.getElementById('btn-payment-cash')?.classList.toggle('active', !isCard);
    document.getElementById('btn-payment-card')?.classList.toggle('active', isCard);
}

function syncAddFormPanelsUi(mode) {
    const isLoan = mode === 'loan';
    const isCard = mode === 'card';
    const isStandard = mode === 'expense' || mode === 'income';

    document.getElementById('add-hero-standard')?.classList.toggle('hidden', !isStandard);
    document.getElementById('add-payment-row')?.classList.toggle('hidden', mode !== 'expense');
    document.getElementById('btn-loan-payment')?.classList.toggle('active', isLoan);
    document.getElementById('btn-card-payment')?.classList.toggle('active', isCard);

    const footer = document.getElementById('add-form-footer');
    if (footer) footer.dataset.mode = mode;

    updateAddFormFooterSummary();
}

function getAddCategorySearchEntries(type = formState.currentType) {
    const tree = categoryTree[type] || {};
    const entries = [];
    Object.keys(tree).forEach((main) => {
        const subs = tree[main] || [];
        if (subs.length === 0) {
            entries.push({ main, sub: '[Bez podkategorii]', label: main, searchIn: main });
            return;
        }
        subs.forEach((sub) => {
            entries.push({ main, sub, label: `${main} → ${sub}`, searchIn: sub });
        });
    });
    return entries;
}

function clearAddCategorySearch() {
    const input = document.getElementById('add-category-search');
    if (input) input.value = '';
    renderAddCategorySearchResults('');
}

function selectAddFormCategoryPair(main, sub) {
    clearAddFormError();
    formState.selectedMainCategory = main;
    formState.selectedSubCategory = sub;
    clearAddCategorySearch();
    renderMainCategoriesForm();
}

function renderAddCategorySearchResults(query = '') {
    const resultsEl = document.getElementById('add-category-search-results');
    const gridsWrap = document.getElementById('add-category-grids-wrap');
    if (!resultsEl || !gridsWrap) return;

    const q = String(query || '').trim();
    if (!q) {
        resultsEl.innerHTML = '';
        resultsEl.classList.add('hidden');
        updateCategoryGridsVisibility();
        return;
    }

    const matches = getAddCategorySearchEntries().filter((entry) =>
        typeof fuzzyTextMatchesQuery === 'function'
            ? fuzzyTextMatchesQuery(entry.searchIn, q)
            : entry.searchIn.toLowerCase().includes(q.toLowerCase())
    );

    gridsWrap.classList.add('hidden');
    resultsEl.classList.remove('hidden');
    resultsEl.innerHTML = '';

    if (!matches.length) {
        const empty = document.createElement('p');
        empty.className = 'add-category-search-empty';
        empty.textContent = 'Brak wyników — spróbuj innej frazy';
        resultsEl.appendChild(empty);
        return;
    }

    matches.forEach((entry) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'add-category-search-hit';
        const isSelected = formState.selectedMainCategory === entry.main
            && formState.selectedSubCategory === entry.sub;
        if (isSelected) btn.classList.add('selected');
        btn.innerHTML = `${renderCategoryIcon(entry.main, 'chip', entry.sub === '[Bez podkategorii]' ? null : entry.sub, formState.currentType)}<span class="add-category-search-hit-label">${entry.label}</span>`;
        btn.onclick = () => selectAddFormCategoryPair(entry.main, entry.sub);
        resultsEl.appendChild(btn);
    });
}

function initAddFormUi() {
    updateAddDateChipLabel();
    updateAddCategorySummary();
    syncAddPaymentMethodUi();
    updateAddFormFooterSummary();
    updateAddCategoryBrowseUi({ autoFocus: true });

    const picker = document.getElementById('add-category-picker');
    if (picker && !picker.dataset.bound) {
        picker.dataset.bound = '1';
        picker.addEventListener('toggle', () => {
            updateCategoryGridsVisibility();
        });
    }
}
