/* Ustawienia — nawigacja, kategorie, budżety */

function showSettingsToast(message, variant = 'success') {
    showAppToast(message, variant);
}


const SETTINGS_SECTION_KEY = 'settings_section';
const SETTINGS_SECTIONS = ['account', 'appearance', 'categories', 'budgets', 'assistant', 'notifications', 'backup'];
let settingsSection = 'appearance';

function setSettingsSection(section) {
    if (!SETTINGS_SECTIONS.includes(section)) return;
    settingsSection = section;
    try { localStorage.setItem(SETTINGS_SECTION_KEY, section); } catch { /* ignore */ }
    SETTINGS_SECTIONS.forEach((id) => {
        document.getElementById(`settings-section-${id}`)?.classList.toggle('hidden', id !== section);
        document.getElementById(`btn-settings-${id}`)?.classList.toggle('active', id === section);
    });
    if (section === 'budgets') {
        renderBudgetEditor();
        if (typeof renderMonthCloseReopenSettings === 'function') renderMonthCloseReopenSettings();
    }
    if (section === 'categories' && typeof renderCategoryRulesEditor === 'function') renderCategoryRulesEditor();
    if (section === 'account' && typeof refreshAccountSettingsUI === 'function') refreshAccountSettingsUI();
    if (section === 'backup') {
        syncAutoCloudBackupToggleUI();
        refreshBackupInfo();
    }
    if (section === 'assistant' && typeof syncAssistantSettingsUI === 'function') {
        syncAssistantSettingsUI();
    }
}

function openSettings(preferredSection) {
    if (typeof guardAppLockSensitiveAction === 'function' && !guardAppLockSensitiveAction()) return;
    document.getElementById('settings-overlay').classList.remove('hidden');
    document.body.classList.add('settings-open');
    if (typeof syncNotificationSettingsUI === 'function') syncNotificationSettingsUI();
    const saved = localStorage.getItem(THEME_KEY) || 'auto';
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === saved);
    });
    refreshBackupInfo();
    syncAutoCloudBackupToggleUI();
    if (typeof refreshStorageUsageUI === 'function') refreshStorageUsageUI();
    refreshBudgetSettingsUI();
    let section = settingsSection;
    if (preferredSection && SETTINGS_SECTIONS.includes(preferredSection)) {
        section = preferredSection;
    } else {
        try {
            const stored = localStorage.getItem(SETTINGS_SECTION_KEY);
            if (stored && SETTINGS_SECTIONS.includes(stored)) section = stored;
        } catch { /* ignore */ }
    }
    setSettingsSection(section);
}

function openCategoryEditor() {
    categoryEditorType = 'expense';
    document.getElementById('category-editor-overlay').classList.remove('hidden');
    document.getElementById('btn-category-editor-expense').classList.add('active');
    document.getElementById('btn-category-editor-income').classList.remove('active');
    renderCategoryEditor();
}

function closeCategoryEditor() {
    closeCategoryIconPicker();
    document.getElementById('category-editor-overlay').classList.add('hidden');
}

let categoryIconPickerTarget = null;

function updateCategoryEditIconButton(btn, mainLabel, sub, txType) {
    const path = btn.dataset.iconPath || getCategoryIconPath(mainLabel, sub || null, txType);
    const color = resolveIconColor(mainLabel, sub || null, txType);
    btn.innerHTML = `<span class="cat-icon-wrap cat-icon-wrap--chip" style="background:${categoryColorAlpha(color, 0.16)};color:${color}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg></span>`;
}

function createCategoryEditIconButton(mainLabel, sub, txType, options = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = options.isMain
        ? 'category-edit-icon-btn category-edit-icon-btn--main'
        : 'category-edit-icon-btn';
    btn.setAttribute('aria-label', sub ? 'Zmień ikonę podkategorii' : 'Zmień ikonę kategorii');
    btn.dataset.originalMain = mainLabel || '';
    if (sub) btn.dataset.originalSub = sub;
    const override = getCategoryIconOverride(txType, mainLabel, sub || null);
    if (override) btn.dataset.iconPath = override;
    updateCategoryEditIconButton(btn, mainLabel || 'Inne', sub || null, txType);
    btn.onclick = () => openCategoryIconPicker(btn);
    return btn;
}

function ensureCategoryIconPickerGrid() {
    const grid = document.getElementById('category-icon-picker-grid');
    if (!grid || grid.childElementCount) return;
    getCategoryIconPresets().forEach(({ path, label }) => {
        const presetBtn = document.createElement('button');
        presetBtn.type = 'button';
        presetBtn.className = 'category-icon-preset-btn';
        presetBtn.title = label;
        presetBtn.dataset.path = path;
        presetBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`;
        presetBtn.onclick = () => selectCategoryIcon(path);
        grid.appendChild(presetBtn);
    });
}

function openCategoryIconPicker(targetBtn) {
    categoryIconPickerTarget = targetBtn;
    ensureCategoryIconPickerGrid();
    document.getElementById('category-icon-picker')?.classList.remove('hidden');
}

function closeCategoryIconPicker() {
    document.getElementById('category-icon-picker')?.classList.add('hidden');
    categoryIconPickerTarget = null;
}

function refreshCategoryEditIconFromRow(iconBtn) {
    const row = iconBtn.closest('.category-edit-row');
    const group = iconBtn.closest('.category-edit-group');
    const mainInput = group?.querySelector('.category-edit-input--main');
    const subInput = row?.querySelector('.category-edit-input--sub');
    const main = mainInput?.value.trim() || 'Inne';
    const sub = subInput?.value.trim() || null;
    const isMain = iconBtn.classList.contains('category-edit-icon-btn--main');
    updateCategoryEditIconButton(iconBtn, main, isMain ? null : sub, categoryEditorType);
}

function selectCategoryIcon(path) {
    if (!categoryIconPickerTarget) return;
    categoryIconPickerTarget.dataset.iconPath = path;
    refreshCategoryEditIconFromRow(categoryIconPickerTarget);
    closeCategoryIconPicker();
}

function resetCategoryIconPicker() {
    if (!categoryIconPickerTarget) return;
    delete categoryIconPickerTarget.dataset.iconPath;
    refreshCategoryEditIconFromRow(categoryIconPickerTarget);
    closeCategoryIconPicker();
}

function saveCategoryEditorIcons(type, groups) {
    ensureCategoryIconsState();
    const mains = {};
    const subs = {};
    groups.forEach((group) => {
        const mainInput = group.querySelector('.category-edit-input--main');
        const main = mainInput?.value.trim();
        if (!main) return;
        const mainBtn = group.querySelector('.category-edit-icon-btn--main');
        if (mainBtn?.dataset.iconPath) mains[main] = mainBtn.dataset.iconPath;
        group.querySelectorAll('.category-edit-row--sub').forEach((row) => {
            const subInput = row.querySelector('.category-edit-input--sub');
            const sub = subInput?.value.trim();
            if (!sub) return;
            const btn = row.querySelector('.category-edit-icon-btn');
            if (btn?.dataset.iconPath) subs[`${main}|${sub}`] = btn.dataset.iconPath;
        });
    });
    appState.categoryIcons[type] = { mains, subs };
}

function setCategoryEditorType(type) {
    if (categoryEditorType === type) return;
    categoryEditorType = type;
    document.getElementById('btn-category-editor-expense').classList.toggle('active', type === 'expense');
    document.getElementById('btn-category-editor-income').classList.toggle('active', type === 'income');
    renderCategoryEditor();
}

function getCategoryEditorMainLabel(group) {
    const mainInput = group?.querySelector('.category-edit-input--main');
    return mainInput?.value.trim() || 'Inne';
}

function getCategoryEditorTxCount(type, main, sub = null) {
    if (!main) return 0;
    return appState.transactions.filter((tx) => {
        if (tx.type !== type) return false;
        if (tx.mainCategory !== main) return false;
        if (sub === null || sub === '') return true;
        return tx.subCategory === sub;
    }).length;
}

function confirmCategoryEditorRemoval({ kind, mainOriginal, subOriginal, label }) {
    const isNew = kind === 'main' ? !mainOriginal : !subOriginal;
    if (isNew) return true;
    const txCount = getCategoryEditorTxCount(
        categoryEditorType,
        mainOriginal,
        kind === 'sub' ? subOriginal : null
    );
    const displayLabel = label || (kind === 'main' ? 'kategorię' : 'podkategorię');
    const message = txCount > 0
        ? `Usunąć „${displayLabel}”? ${txCount} transakcji zachowa tę kategorię w historii.`
        : `Usunąć „${displayLabel}”?`;
    return confirm(message);
}

function createCategoryEditDeleteButton(ariaLabel) {
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'category-edit-delete-btn';
    delBtn.setAttribute('aria-label', ariaLabel);
    delBtn.textContent = '×';
    return delBtn;
}

function deleteCategoryEditorSubRow(subRow, group) {
    const subInput = subRow.querySelector('.category-edit-input--sub');
    const mainInput = group.querySelector('.category-edit-input--main');
    const mainOriginal = mainInput?.dataset.original || '';
    const subOriginal = subInput?.dataset.original || '';
    const label = subInput?.value.trim() || 'podkategorię';
    if (!confirmCategoryEditorRemoval({ kind: 'sub', mainOriginal, subOriginal, label })) return;
    subRow.remove();
}

function deleteCategoryEditorMainGroup(group) {
    const mainInput = group.querySelector('.category-edit-input--main');
    const mainOriginal = mainInput?.dataset.original || '';
    const label = mainInput?.value.trim() || 'nową kategorię';
    if (!confirmCategoryEditorRemoval({ kind: 'main', mainOriginal, subOriginal: '', label })) return;
    group.remove();
}

function createCategoryEditSubRow(sub, mainLabel, txType, options = {}) {
    const subRow = document.createElement('div');
    subRow.className = 'category-edit-row category-edit-row--sub';
    const iconBtn = createCategoryEditIconButton(mainLabel, sub || null, txType);
    subRow.appendChild(iconBtn);
    const subInput = document.createElement('input');
    subInput.type = 'text';
    subInput.className = 'category-edit-input category-edit-input--sub';
    subInput.value = sub || '';
    subInput.dataset.original = sub || '';
    subInput.maxLength = 40;
    if (options.placeholder) subInput.placeholder = options.placeholder;
    subInput.addEventListener('input', () => {
        const main = options.group ? getCategoryEditorMainLabel(options.group) : mainLabel;
        updateCategoryEditIconButton(iconBtn, main, subInput.value.trim() || 'Inne', txType);
    });
    subRow.appendChild(subInput);
    if (options.group) {
        const delBtn = createCategoryEditDeleteButton('Usuń podkategorię');
        delBtn.onclick = () => deleteCategoryEditorSubRow(subRow, options.group);
        subRow.appendChild(delBtn);
    }
    return subRow;
}

function createCategoryEditGroup(main, subs, txType) {
    const group = document.createElement('div');
    group.className = 'category-edit-group';

    const mainRow = document.createElement('div');
    mainRow.className = 'category-edit-row category-edit-row--main';
    const mainIconBtn = createCategoryEditIconButton(main || 'Inne', null, txType, { isMain: true });
    mainRow.appendChild(mainIconBtn);
    const mainInput = document.createElement('input');
    mainInput.type = 'text';
    mainInput.className = 'category-edit-input category-edit-input--main';
    mainInput.value = main || '';
    mainInput.dataset.original = main || '';
    mainInput.maxLength = 40;
    if (!main) mainInput.placeholder = 'Nowa kategoria główna';
    mainInput.addEventListener('input', () => {
        updateCategoryEditIconButton(mainIconBtn, mainInput.value.trim() || 'Inne', null, txType);
    });
    mainRow.appendChild(mainInput);
    const mainDelBtn = createCategoryEditDeleteButton('Usuń kategorię');
    mainDelBtn.onclick = () => deleteCategoryEditorMainGroup(group);
    mainRow.appendChild(mainDelBtn);
    group.appendChild(mainRow);

    const subsWrap = document.createElement('div');
    subsWrap.className = 'category-edit-subs';
    (subs || []).forEach((sub) => {
        subsWrap.appendChild(createCategoryEditSubRow(sub, main || 'Inne', txType, { group }));
    });

    const addSubBtn = document.createElement('button');
    addSubBtn.type = 'button';
    addSubBtn.className = 'category-edit-add-btn';
    addSubBtn.textContent = '+ Dodaj podkategorię';
    addSubBtn.onclick = () => addCategoryEditorSubcategory(group);
    subsWrap.appendChild(addSubBtn);
    group.appendChild(subsWrap);

    return group;
}

function addCategoryEditorSubcategory(group) {
    const subsWrap = group.querySelector('.category-edit-subs');
    const addBtn = subsWrap.querySelector('.category-edit-add-btn');
    const row = createCategoryEditSubRow('', getCategoryEditorMainLabel(group), categoryEditorType, {
        placeholder: 'Nowa podkategoria',
        group
    });
    subsWrap.insertBefore(row, addBtn);
    row.querySelector('input')?.focus();
}

function addCategoryEditorMainCategory() {
    const list = document.getElementById('category-editor-list');
    const addMainWrap = list.querySelector('.category-editor-add-main');
    const group = createCategoryEditGroup('', [], categoryEditorType);
    if (addMainWrap) {
        list.insertBefore(group, addMainWrap);
    } else {
        list.appendChild(group);
    }
    group.querySelector('.category-edit-input--main')?.focus();
}

function renderCategoryEditor() {
    const list = document.getElementById('category-editor-list');
    list.innerHTML = '';
    const txType = categoryEditorType;
    if (!categoryTree[txType] || typeof categoryTree[txType] !== 'object') {
        categoryTree[txType] = {};
    }

    Object.keys(categoryTree[txType]).forEach((main) => {
        list.appendChild(createCategoryEditGroup(main, categoryTree[txType][main], txType));
    });

    const addMainWrap = document.createElement('div');
    addMainWrap.className = 'category-editor-add-main';
    const addMainBtn = document.createElement('button');
    addMainBtn.type = 'button';
    addMainBtn.className = 'category-edit-add-btn category-edit-add-btn--main';
    addMainBtn.textContent = '+ Dodaj kategorię główną';
    addMainBtn.onclick = addCategoryEditorMainCategory;
    addMainWrap.appendChild(addMainBtn);
    list.appendChild(addMainWrap);
}

function collectCategoryEditorDeletions(type, groups) {
    const deletedMains = [];
    const deletedSubs = [];
    const oldTree = categoryTree[type] || {};
    const survivingMains = new Set();

    groups.forEach((group) => {
        const mainInput = group.querySelector('.category-edit-input--main');
        const oldMain = mainInput?.dataset?.original || '';
        if (oldMain) survivingMains.add(oldMain);

        const survivingSubs = new Set();
        group.querySelectorAll('.category-edit-input--sub').forEach((subInput) => {
            const oldSub = subInput.dataset.original || '';
            if (oldSub) survivingSubs.add(oldSub);
        });

        if (oldMain && Array.isArray(oldTree[oldMain])) {
            oldTree[oldMain].forEach((oldSub) => {
                if (!survivingSubs.has(oldSub)) {
                    deletedSubs.push({ oldMain, oldSub });
                }
            });
        }
    });

    Object.keys(oldTree).forEach((oldMain) => {
        if (!survivingMains.has(oldMain)) {
            deletedMains.push(oldMain);
        }
    });

    return { deletedMains, deletedSubs };
}

function applyCategoryEditorDeletions(type, deletedMains, deletedSubs) {
    if (!appState.categoryBudgets) appState.categoryBudgets = {};
    if (!appState.subCategoryBudgets) appState.subCategoryBudgets = {};

    deletedMains.forEach((main) => {
        delete appState.categoryBudgets[main];
        delete chartHiddenMainCategories[main];
        delete chartHiddenSubCategories[main];
        Object.keys(appState.subCategoryBudgets).forEach((key) => {
            const parsed = typeof parseSubCategoryBudgetKey === 'function'
                ? parseSubCategoryBudgetKey(key)
                : { mainCategory: key.split('\u0001')[0] };
            if (parsed.mainCategory === main) delete appState.subCategoryBudgets[key];
        });
        if (activeChartCategory === main) {
            activeChartCategory = null;
            activeChartSubCategory = null;
        }
        if (formState.selectedMainCategory === main) {
            formState.selectedMainCategory = '';
            formState.selectedSubCategory = '';
        }
    });

    deletedSubs.forEach(({ oldMain, oldSub }) => {
        if (typeof makeSubCategoryBudgetKey === 'function') {
            delete appState.subCategoryBudgets[makeSubCategoryBudgetKey(oldMain, oldSub)];
        }
        const hidden = chartHiddenSubCategories[oldMain];
        if (hidden) delete hidden[oldSub];
        if (activeChartCategory === oldMain && activeChartSubCategory === oldSub) {
            activeChartSubCategory = null;
        }
        if (formState.selectedMainCategory === oldMain && formState.selectedSubCategory === oldSub) {
            formState.selectedSubCategory = '';
        }
    });

    purgeRecentCategoriesForDeleted(deletedMains, deletedSubs, type);
}

function migrateSubCategoryBudgetsOnCategoryRename(mainMap, subRenames) {
    if (!appState.subCategoryBudgets || typeof makeSubCategoryBudgetKey !== 'function') return;
    const next = {};
    Object.entries(appState.subCategoryBudgets).forEach(([rawKey, value]) => {
        let { mainCategory, subCategory } = typeof parseSubCategoryBudgetKey === 'function'
            ? parseSubCategoryBudgetKey(rawKey)
            : { mainCategory: rawKey, subCategory: '[Bez podkategorii]' };
        if (mainMap[mainCategory]) mainCategory = mainMap[mainCategory];
        subRenames.forEach((rename) => {
            const renameMain = mainMap[rename.oldMain] || rename.oldMain;
            if (mainCategory === renameMain && subCategory === rename.oldSub) {
                subCategory = rename.newSub;
            }
        });
        next[makeSubCategoryBudgetKey(mainCategory, subCategory)] = value;
    });
    appState.subCategoryBudgets = next;
}

function saveCategoryEditor() {
    const type = categoryEditorType;
    const mainRenames = [];
    const subRenames = [];
    const newTypeTree = {};
    const collectedMainNames = [];

    const groups = document.querySelectorAll('#category-editor-list .category-edit-group');
    for (const group of groups) {
        const mainInput = group.querySelector('.category-edit-input--main');
        const oldMain = mainInput.dataset.original;
        const newMain = mainInput.value.trim();
        if (!newMain) {
            alert('Nazwa kategorii głównej nie może być pusta.');
            mainInput.focus();
            return;
        }

        const subs = [];
        const subInputs = group.querySelectorAll('.category-edit-input--sub');
        for (const subInput of subInputs) {
            const oldSub = subInput.dataset.original;
            const newSub = subInput.value.trim();
            if (!newSub) {
                alert('Nazwa podkategorii nie może być pusta.');
                subInput.focus();
                return;
            }
            if (newSub === '[Bez podkategorii]') {
                alert('Ta nazwa podkategorii jest zarezerowana.');
                subInput.focus();
                return;
            }
            subs.push(newSub);
            if (oldSub !== newSub) subRenames.push({ oldMain, oldSub, newSub });
        }

        collectedMainNames.push(newMain);
        if (oldMain !== newMain) mainRenames.push({ oldMain, newMain });
        newTypeTree[newMain] = subs;
    }

    if (!collectedMainNames.length) {
        alert('Musi zostać co najmniej jedna kategoria główna.');
        return;
    }

    if (collectedMainNames.length !== new Set(collectedMainNames).size) {
        alert('Kategorie główne muszą mieć unikalne nazwy.');
        return;
    }

    const mainNames = Object.keys(newTypeTree);
    for (const main of mainNames) {
        const subs = newTypeTree[main];
        if (subs.length !== new Set(subs).size) {
            alert(`Podkategorie w „${main}” muszą mieć unikalne nazwy.`);
            return;
        }
    }

    const mainMap = {};
    mainRenames.forEach((r) => { mainMap[r.oldMain] = r.newMain; });

    const { deletedMains, deletedSubs } = collectCategoryEditorDeletions(type, groups);

    categoryTree[type] = newTypeTree;
    appState.categoryTree = categoryTree;

    applyCategoryEditorDeletions(type, deletedMains, deletedSubs);
    migrateSubCategoryBudgetsOnCategoryRename(mainMap, subRenames);

    appState.transactions.forEach((tx) => {
        if (tx.type !== type) return;
        const origMain = tx.mainCategory;
        const origSub = tx.subCategory;
        if (mainMap[origMain]) tx.mainCategory = mainMap[origMain];
        subRenames.forEach((r) => {
            if (origMain === r.oldMain && origSub === r.oldSub) tx.subCategory = r.newSub;
        });
    });

    if (activeChartCategory && mainMap[activeChartCategory]) {
        activeChartCategory = mainMap[activeChartCategory];
    }
    Object.keys(mainMap).forEach((oldMain) => {
        const newMain = mainMap[oldMain];
        if (chartHiddenMainCategories[oldMain]) {
            chartHiddenMainCategories[newMain] = chartHiddenMainCategories[oldMain];
            delete chartHiddenMainCategories[oldMain];
        }
        if (chartHiddenSubCategories[oldMain]) {
            chartHiddenSubCategories[newMain] = chartHiddenSubCategories[oldMain];
            delete chartHiddenSubCategories[oldMain];
        }
    });
    subRenames.forEach((r) => {
        const mainKey = mainMap[r.oldMain] || r.oldMain;
        const hidden = chartHiddenSubCategories[mainKey];
        if (hidden && hidden[r.oldSub]) {
            hidden[r.newSub] = hidden[r.oldSub];
            delete hidden[r.oldSub];
        }
        if (activeChartSubCategory === r.oldSub && (activeChartCategory === mainKey || activeChartCategory === r.oldMain)) {
            activeChartSubCategory = r.newSub;
        }
    });
    if (formState.selectedMainCategory && mainMap[formState.selectedMainCategory]) {
        formState.selectedMainCategory = mainMap[formState.selectedMainCategory];
    }
    subRenames.forEach((r) => {
        if (formState.selectedSubCategory === r.oldSub && formState.selectedMainCategory === (mainMap[r.oldMain] || r.oldMain)) {
            formState.selectedSubCategory = r.newSub;
        }
    });

    migrateRecentCategories(mainMap, subRenames, type);
    saveCategoryEditorIcons(type, groups);
    saveState();
    hapticFeedback();
    closeCategoryEditor();
    showSettingsToast('Kategorie zapisane');
    refreshCurrentView();
}

function suggestCategoryBudget(mainCategory, subCategory = null) {
    const totals = [];
    const now = new Date();
    const txs = typeof getBudgetTransactions === 'function' ? getBudgetTransactions() : appState.transactions;
    for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        const end = localIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
        const sum = txs
            .filter((t) => {
                if (t.type !== 'expense' || t.mainCategory !== mainCategory || t.date < start || t.date > end) return false;
                if (!subCategory) return true;
                const sub = typeof normalizeSubCategoryForBudget === 'function'
                    ? normalizeSubCategoryForBudget(t.subCategory)
                    : (t.subCategory || '[Bez podkategorii]');
                const target = typeof normalizeSubCategoryForBudget === 'function'
                    ? normalizeSubCategoryForBudget(subCategory)
                    : subCategory;
                return sub === target;
            })
            .reduce((s, t) => s + t.amount, 0);
        totals.push(sum);
    }
    const withSpending = totals.filter((v) => v > 0);
    if (!withSpending.length) return 0;
    return Math.round(withSpending.reduce((a, b) => a + b, 0) / withSpending.length);
}

function suggestSubCategoryBudget(mainCategory, subCategory) {
    return suggestCategoryBudget(mainCategory, subCategory);
}

function setBudgetConfirmOnOver(enabled) {
    if (!appState.reportPrefs || typeof appState.reportPrefs !== 'object') appState.reportPrefs = {};
    appState.reportPrefs.budgetConfirmOnOver = !!enabled;
    saveState();
}

function refreshBudgetSettingsUI() {
    const confirmToggle = document.getElementById('budget-confirm-over-toggle');
    if (confirmToggle && typeof isBudgetConfirmOnOverEnabled === 'function') {
        confirmToggle.checked = isBudgetConfirmOnOverEnabled();
    }
}

function getBudgetEditorListEl() {
    return document.getElementById('settings-budget-list');
}

function getBudgetEditorInputs() {
    const list = getBudgetEditorListEl();
    return list ? list.querySelectorAll('.budget-editor-input') : [];
}

function openBudgetEditor() {
    openSettings('budgets');
}

function closeBudgetEditor() {
    /* limity są w zakładce Budżety w ustawieniach */
}

function parseBudgetMoneyValue(raw) {
    if (raw == null || raw === '') return 0;
    const normalized = String(raw).replace(/\s/g, '').replace(',', '.');
    const value = parseFloat(normalized);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function renderBudgetLimitUsageBlock(mainCategory, subCategory, suggested) {
    if (typeof getCurrentMonthKey !== 'function') return '';
    const monthKey = getCurrentMonthKey();
    let status = null;
    let spent = 0;
    if (subCategory && typeof getSubCategorySpentInMonth === 'function') {
        spent = getSubCategorySpentInMonth(mainCategory, subCategory, monthKey);
        const key = typeof makeSubCategoryBudgetKey === 'function'
            ? makeSubCategoryBudgetKey(mainCategory, subCategory)
            : `${mainCategory}\u0001${subCategory}`;
        if ((appState.subCategoryBudgets || {})[key] > 0 && typeof getSubCategoryBudgetStatus === 'function') {
            status = getSubCategoryBudgetStatus(mainCategory, subCategory, monthKey);
        }
    } else if (typeof getCategorySpentInMonth === 'function') {
        spent = getCategorySpentInMonth(mainCategory, monthKey);
        if ((appState.categoryBudgets || {})[mainCategory] > 0 && typeof getCategoryBudgetStatus === 'function') {
            status = getCategoryBudgetStatus(mainCategory, monthKey);
        }
    }
    if (status && status.limit > 0) {
        const pct = Math.min(status.pct, 100);
        const fillClass = status.state === 'over'
            ? 'budget-bar-fill--over'
            : (status.state === 'warn' ? 'budget-bar-fill--warn' : '');
        return `<div class="budget-limit-usage">
            <div class="budget-row-meta">
                <span>Ten miesiąc ${formatPlnAmount(status.spent)} / ${formatPlnAmount(status.limit)}</span>
                <span>${status.pct}%</span>
            </div>
            <div class="progress-bar-bg budget-bar"><div class="progress-bar-fill budget-bar-fill ${fillClass}" style="width:${pct}%"></div></div>
        </div>`;
    }
    const hints = [];
    if (spent > 0) hints.push(`Ten miesiąc: ${formatPlnAmount(spent)}`);
    if (suggested > 0) hints.push(`Śr. 6m: ${formatPlnAmount(suggested)}`);
    if (!hints.length) return '';
    return `<p class="budget-limit-hint">${hints.join(' · ')}</p>`;
}

function toggleBudgetLimitSubs(btn) {
    const group = btn?.closest('.budget-limit-group');
    if (!group) return;
    const expanded = group.classList.toggle('budget-limit-group--subs-open');
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function toggleBudgetLimitGroup(btn) {
    const group = btn?.closest('.budget-limit-group');
    if (!group) return;
    const expanded = group.classList.toggle('budget-limit-group--open');
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function shouldBudgetLimitGroupOpen(cat) {
    const mainBudget = (appState.categoryBudgets || {})[cat] || 0;
    const subs = (categoryTree.expense || {})[cat] || [];
    const subBudgets = appState.subCategoryBudgets || {};
    const hasSubBudget = subs.some((sub) => {
        const key = typeof makeSubCategoryBudgetKey === 'function'
            ? makeSubCategoryBudgetKey(cat, sub)
            : `${cat}\u0001${sub}`;
        return (subBudgets[key] || 0) > 0;
    });
    if (mainBudget > 0 || hasSubBudget) return true;
    if (typeof getCategoryBudgetStatus === 'function' && typeof getCurrentMonthKey === 'function') {
        const status = getCategoryBudgetStatus(cat, getCurrentMonthKey());
        if (status && (status.state === 'warn' || status.state === 'over')) return true;
    }
    return false;
}

function renderBudgetLimitCollapsedSummary(cat, mainBudget, hasSubBudget) {
    const parts = [];
    if (mainBudget > 0) {
        parts.push(`<span class="budget-limit-summary-limit">${formatPlnAmount(mainBudget)}</span>`);
    }
    if (typeof getCategoryBudgetStatus === 'function' && typeof getCurrentMonthKey === 'function') {
        const status = getCategoryBudgetStatus(cat, getCurrentMonthKey());
        if (status && status.limit > 0) {
            const stateClass = status.state === 'over'
                ? 'budget-limit-summary-pct--over'
                : (status.state === 'warn' ? 'budget-limit-summary-pct--warn' : '');
            parts.push(`<span class="budget-limit-summary-pct ${stateClass}">${status.pct}%</span>`);
        }
    }
    if (!mainBudget && !parts.length) {
        parts.push('<span class="budget-limit-summary-muted">Bez limitu</span>');
    }
    if (hasSubBudget) {
        parts.push('<span class="budget-limit-summary-badge">Podkat.</span>');
    }
    return `<span class="budget-limit-summary">${parts.join('')}</span>`;
}

function filterBudgetEditorList(query) {
    const q = String(query || '').trim().toLowerCase();
    document.querySelectorAll('#settings-budget-list .budget-limit-group').forEach((group) => {
        const hay = (group.dataset.search || '').toLowerCase();
        const match = !q.length || hay.includes(q);
        group.classList.toggle('hidden', !match);
        if (match && q.length > 0) group.classList.add('budget-limit-group--open');
    });
}

function setAllBudgetLimitGroupsOpen(open) {
    document.querySelectorAll('#settings-budget-list .budget-limit-group').forEach((group) => {
        group.classList.toggle('budget-limit-group--open', open);
        const toggle = group.querySelector('.budget-limit-head--toggle');
        if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
}

function renderBudgetLimitField(kind, mainCategory, subCategory, inputDataset, suggested) {
    const budgets = kind === 'sub' ? (appState.subCategoryBudgets || {}) : (appState.categoryBudgets || {});
    const budgetKey = kind === 'sub' && typeof makeSubCategoryBudgetKey === 'function'
        ? makeSubCategoryBudgetKey(mainCategory, subCategory)
        : mainCategory;
    const budget = budgets[budgetKey] || '';
    const datasetAttrs = Object.entries(inputDataset)
        .map(([key, value]) => `data-${key}="${String(value).replace(/"/g, '&quot;')}"`)
        .join(' ');
    const suggestHandler = kind === 'sub'
        ? `applySubBudgetSuggestion(this)`
        : `applyBudgetSuggestion(this)`;
    const suggestLink = suggested > 0
        ? `<button type="button" class="btn-text-link budget-limit-suggest" ${datasetAttrs} onclick="${suggestHandler}">Wstaw średnią 6m (${formatPlnAmount(suggested)})</button>`
        : '';
    return `<div class="form-group budget-limit-field">
        <label class="section-label">Limit miesięczny (PLN)</label>
        <input type="number" class="budget-editor-input budget-limit-input" min="0" step="50" ${datasetAttrs}
            value="${budget || ''}" placeholder="Bez limitu" aria-label="Limit miesięczny">
        ${suggestLink}
    </div>`;
}

function renderBudgetLimitSubRow(mainCategory, subCategory) {
    const suggested = suggestSubCategoryBudget(mainCategory, subCategory);
    const usage = renderBudgetLimitUsageBlock(mainCategory, subCategory, suggested);
    return `<div class="budget-limit-sub" data-search="${escapeHtml(`${mainCategory} ${subCategory}`)}">
        <p class="budget-limit-sub-title">${escapeHtml(subCategory)}</p>
        ${renderBudgetLimitField('sub', mainCategory, subCategory, { kind: 'sub', main: mainCategory, sub: subCategory }, suggested)}
        ${usage}
    </div>`;
}

function renderBudgetLimitGroup(cat) {
    const subs = categoryTree.expense[cat] || [];
    const mainBudget = (appState.categoryBudgets || {})[cat] || 0;
    const subBudgets = appState.subCategoryBudgets || {};
    const hasSubBudget = subs.some((sub) => {
        const key = typeof makeSubCategoryBudgetKey === 'function'
            ? makeSubCategoryBudgetKey(cat, sub)
            : `${cat}\u0001${sub}`;
        return (subBudgets[key] || 0) > 0;
    });
    const groupOpen = shouldBudgetLimitGroupOpen(cat);
    const subsOpen = mainBudget > 0 || hasSubBudget;
    const suggested = suggestCategoryBudget(cat);
    const usage = renderBudgetLimitUsageBlock(cat, null, suggested);
    const subRows = subs.map((sub) => renderBudgetLimitSubRow(cat, sub)).join('');
    const searchBlob = [cat, ...subs].join(' ');
    const summary = renderBudgetLimitCollapsedSummary(cat, mainBudget, hasSubBudget);
    const subsToggle = subs.length
        ? `<button type="button" class="budget-limit-subs-toggle" aria-expanded="${subsOpen ? 'true' : 'false'}" aria-label="Pokaż podkategorie" onclick="toggleBudgetLimitSubs(this)">
            <span class="budget-limit-subs-label">Podkategorie (${subs.length})</span>
            <svg class="budget-limit-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
        </button>`
        : '';
    return `<div class="budget-status-group budget-limit-group${groupOpen ? ' budget-limit-group--open' : ''}${subsOpen ? ' budget-limit-group--subs-open' : ''}" data-search="${escapeHtml(searchBlob)}">
        <button type="button" class="budget-limit-head budget-limit-head--toggle" aria-expanded="${groupOpen ? 'true' : 'false'}" onclick="toggleBudgetLimitGroup(this)">
            ${renderCategoryIcon(cat, 'list', null, 'expense')}
            <span class="budget-limit-title">${escapeHtml(cat)}</span>
            ${summary}
            <svg class="budget-limit-chevron budget-limit-head-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
        </button>
        <div class="budget-limit-body">
            <div class="budget-limit-panel">
                ${renderBudgetLimitField('main', cat, null, { kind: 'main', cat }, suggested)}
                ${usage}
            </div>
            ${subs.length ? `${subsToggle}<div class="budget-limit-subs">${subRows}</div>` : ''}
        </div>
    </div>`;
}

function renderBudgetEditor() {
    const list = getBudgetEditorListEl();
    if (!list) return;
    const categories = Object.keys(categoryTree.expense || {});
    const toolbar = `<div class="budget-editor-toolbar">
        <input type="search" class="budget-editor-search" placeholder="Szukaj kategorii…" oninput="filterBudgetEditorList(this.value)" aria-label="Szukaj kategorii">
        <button type="button" class="btn-outline btn-outline--compact budget-editor-fill-all" onclick="applyAllBudgetSuggestions()">Średnia 6m</button>
    </div>
    <div class="budget-editor-bulk-actions">
        <button type="button" class="btn-text-link" onclick="setAllBudgetLimitGroupsOpen(true)">Rozwiń wszystkie</button>
        <span class="budget-editor-bulk-sep" aria-hidden="true">·</span>
        <button type="button" class="btn-text-link" onclick="setAllBudgetLimitGroupsOpen(false)">Zwiń wszystkie</button>
    </div>`;
    list.innerHTML = toolbar + categories.map((cat) => renderBudgetLimitGroup(cat)).join('');
}

function applyBudgetSuggestion(btn) {
    const scope = btn.closest('.budget-limit-panel, .budget-limit-sub');
    const input = scope?.querySelector('.budget-editor-input');
    const cat = btn.dataset.cat;
    if (!input || !cat) return;
    const value = suggestCategoryBudget(cat);
    if (value > 0) input.value = value;
}

function applySubBudgetSuggestion(btn) {
    const scope = btn.closest('.budget-limit-sub');
    const input = scope?.querySelector('.budget-editor-input');
    const main = btn.dataset.main;
    const sub = btn.dataset.sub;
    if (!input || !main || !sub) return;
    const value = suggestSubCategoryBudget(main, sub);
    if (value > 0) input.value = value;
}

function applyAllBudgetSuggestions() {
    getBudgetEditorInputs().forEach((input) => {
        const kind = input.dataset.kind;
        if (kind === 'sub' && input.dataset.main && input.dataset.sub) {
            const value = suggestSubCategoryBudget(input.dataset.main, input.dataset.sub);
            if (value > 0) input.value = value;
            return;
        }
        const cat = input.dataset.cat;
        if (!cat) return;
        const value = suggestCategoryBudget(cat);
        if (value > 0) input.value = value;
    });
}

function saveBudgetEditor() {
    const inputs = getBudgetEditorInputs();
    if (!appState.categoryBudgets) appState.categoryBudgets = {};
    if (!appState.subCategoryBudgets) appState.subCategoryBudgets = {};
    appState.categoryBudgets = {};
    appState.subCategoryBudgets = {};
    inputs.forEach((input) => {
        const value = parseBudgetMoneyValue(input.value);
        if (input.dataset.kind === 'sub' && input.dataset.main && input.dataset.sub) {
            const key = typeof makeSubCategoryBudgetKey === 'function'
                ? makeSubCategoryBudgetKey(input.dataset.main, input.dataset.sub)
                : `${input.dataset.main}\u0001${input.dataset.sub}`;
            if (value > 0) appState.subCategoryBudgets[key] = value;
            return;
        }
        const cat = input.dataset.cat;
        if (!cat) return;
        if (value > 0) appState.categoryBudgets[cat] = value;
    });
    saveState();
    hapticFeedback();
    showSettingsToast('Limity zapisane');
    if (typeof notifyAfterFinanceChange === 'function') notifyAfterFinanceChange();
    if (typeof refreshVisibleReportsBudgetLists === 'function') refreshVisibleReportsBudgetLists();
    renderBudgetEditor();
}

function closeSettings() {
    document.getElementById('settings-overlay').classList.add('hidden');
    document.body.classList.remove('settings-open');
    if (typeof resetBackupProgressBodyScrollLock === 'function') {
        resetBackupProgressBodyScrollLock();
    } else {
        document.body.style.overflow = '';
    }
}

