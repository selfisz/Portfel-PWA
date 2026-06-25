function getExportPayload() {
    const data = getPersistedState(appState);
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        transactionCount: data.transactions.length,
        data
    };
}

function applyBackupPayload(payload) {
    const data = payload.data || payload;
    if (!data || !Array.isArray(data.transactions)) {
        throw new Error('Nieprawidłowy plik kopii zapasowej.');
    }
    normalizeAppState(data);
    cloudSyncUnlocked = true;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedState(appState)));
    } catch (err) {
        throw new Error('Brak miejsca w pamięci telefonu — zwolnij miejsce w Safari.');
    }
    saveState({ forceCloud: true });
    setSyncStatus('online', getTransactionCount(appState));
    try {
        refreshCurrentView();
    } catch (err) {
        console.error('refreshCurrentView after restore', err);
    }
}

function showSettingsToast(message, variant = 'success') {
    showAppToast(message, variant);
}

function setSettingsButtonBusy(btn, busy, busyLabel) {
    if (!btn) return;
    if (busy) {
        if (!btn.dataset.originalTitle) {
            const titleEl = btn.querySelector('.settings-action-btn-title');
            btn.dataset.originalTitle = titleEl ? titleEl.textContent : btn.textContent;
        }
        btn.disabled = true;
        btn.classList.add('is-busy');
        btn.setAttribute('aria-busy', 'true');
        const titleEl = btn.querySelector('.settings-action-btn-title');
        if (titleEl && busyLabel) titleEl.textContent = busyLabel;
    } else {
        btn.disabled = false;
        btn.classList.remove('is-busy');
        btn.removeAttribute('aria-busy');
        const titleEl = btn.querySelector('.settings-action-btn-title');
        if (titleEl && btn.dataset.originalTitle) titleEl.textContent = btn.dataset.originalTitle;
    }
}

async function refreshBackupInfo() {
    const cloudEl = document.getElementById('backup-cloud-info');
    const localEl = document.getElementById('backup-local-info');
    if (cloudEl) cloudEl.textContent = 'Sprawdzanie…';
    try {
        const payload = await getCloudBackupPayload();
        if (payload?.exportedAt || payload?.data?.transactions?.length) {
            const exportedAt = payload.exportedAt;
            const date = exportedAt
                ? new Date(typeof exportedAt === 'string' ? exportedAt : exportedAt.toDate?.() || exportedAt).toLocaleString('pl-PL')
                : '—';
            const count = payload.transactionCount || payload.data?.transactions?.length || '?';
            if (cloudEl) cloudEl.textContent = `${date} · ${count} trans.`;
        } else if (cloudEl) {
            cloudEl.textContent = 'Brak kopii w chmurze';
        }
    } catch {
        if (cloudEl) cloudEl.textContent = 'Niedostępna — brak połączenia';
    }
    const localRaw = localStorage.getItem(LOCAL_BACKUP_KEY);
    if (localEl) {
        if (localRaw) {
            try {
                const local = JSON.parse(localRaw);
                const count = local.transactionCount || local.data?.transactions?.length || '?';
                localEl.textContent = `${new Date(local.exportedAt).toLocaleString('pl-PL')} · ${count} trans.`;
            } catch {
                localEl.textContent = 'Nieprawidłowa kopia lokalna';
            }
        } else {
            localEl.textContent = 'Brak kopii lokalnej';
        }
    }
}

function openSettings() {
    document.getElementById('settings-overlay').classList.remove('hidden');
    document.body.classList.add('settings-open');
    const saved = localStorage.getItem(THEME_KEY) || 'auto';
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === saved);
    });
    refreshBackupInfo();
}

function openCategoryEditor() {
    categoryEditorType = 'expense';
    document.getElementById('category-editor-overlay').classList.remove('hidden');
    document.getElementById('btn-category-editor-expense').classList.add('active');
    document.getElementById('btn-category-editor-income').classList.remove('active');
    renderCategoryEditor();
}

function closeCategoryEditor() {
    document.getElementById('category-editor-overlay').classList.add('hidden');
}

function setCategoryEditorType(type) {
    if (categoryEditorType === type) return;
    categoryEditorType = type;
    document.getElementById('btn-category-editor-expense').classList.toggle('active', type === 'expense');
    document.getElementById('btn-category-editor-income').classList.toggle('active', type === 'income');
    renderCategoryEditor();
}

function renderCategoryEditor() {
    const list = document.getElementById('category-editor-list');
    list.innerHTML = '';
    const txType = categoryEditorType;

    Object.keys(categoryTree[txType]).forEach((main) => {
        const group = document.createElement('div');
        group.className = 'category-edit-group';

        const mainRow = document.createElement('div');
        mainRow.className = 'category-edit-row category-edit-row--main';
        mainRow.innerHTML = renderCategoryIcon(main, 'chip', null, txType);
        const mainInput = document.createElement('input');
        mainInput.type = 'text';
        mainInput.className = 'category-edit-input category-edit-input--main';
        mainInput.value = main;
        mainInput.dataset.original = main;
        mainInput.maxLength = 40;
        mainRow.appendChild(mainInput);
        group.appendChild(mainRow);

        const subsWrap = document.createElement('div');
        subsWrap.className = 'category-edit-subs';
        categoryTree[txType][main].forEach((sub) => {
            const subRow = document.createElement('div');
            subRow.className = 'category-edit-row category-edit-row--sub';
            subRow.innerHTML = renderCategoryIcon(main, 'chip', sub, txType);
            const subInput = document.createElement('input');
            subInput.type = 'text';
            subInput.className = 'category-edit-input category-edit-input--sub';
            subInput.value = sub;
            subInput.dataset.original = sub;
            subInput.maxLength = 40;
            subRow.appendChild(subInput);
            subsWrap.appendChild(subRow);
        });
        if (categoryTree[txType][main].length) group.appendChild(subsWrap);
        list.appendChild(group);
    });
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
            subs.push(newSub);
            if (oldSub !== newSub) subRenames.push({ oldMain, oldSub, newSub });
        }

        collectedMainNames.push(newMain);
        if (oldMain !== newMain) mainRenames.push({ oldMain, newMain });
        newTypeTree[newMain] = subs;
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

    categoryTree[type] = newTypeTree;
    appState.categoryTree = categoryTree;

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
    saveState();
    hapticFeedback();
    closeCategoryEditor();
    showSettingsToast('Nazwy kategorii zapisane');
    refreshCurrentView();
}

function suggestCategoryBudget(mainCategory) {
    const totals = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        const end = localIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
        const sum = appState.transactions
            .filter((t) => t.type === 'expense' && t.mainCategory === mainCategory && t.date >= start && t.date <= end)
            .reduce((s, t) => s + t.amount, 0);
        totals.push(sum);
    }
    const withSpending = totals.filter((v) => v > 0);
    if (!withSpending.length) return 0;
    return Math.round(withSpending.reduce((a, b) => a + b, 0) / withSpending.length);
}

function openBudgetEditor() {
    document.getElementById('budget-editor-overlay').classList.remove('hidden');
    renderBudgetEditor();
}

function closeBudgetEditor() {
    document.getElementById('budget-editor-overlay').classList.add('hidden');
}

function renderBudgetEditor() {
    const list = document.getElementById('budget-editor-list');
    if (!list) return;
    const categories = Object.keys(categoryTree.expense || {});
    const budgets = appState.categoryBudgets || {};
    list.innerHTML = categories.map((cat) => {
        const suggested = suggestCategoryBudget(cat);
        const budget = budgets[cat] || '';
        const safeCat = cat.replace(/"/g, '&quot;');
        return `<div class="budget-editor-row">
            <div class="budget-row-head">
                ${renderCategoryIcon(cat, 'list', null, 'expense')}
                <span class="budget-cat-name">${escapeHtml(cat)}</span>
                <button type="button" class="btn-budget-suggest" data-cat="${safeCat}" onclick="applyBudgetSuggestion(this)">6m</button>
                <input type="number" class="budget-input budget-editor-input" min="0" step="50" data-cat="${safeCat}"
                    value="${budget || ''}" placeholder="${suggested > 0 ? suggested : '—'}">
            </div>
            ${suggested > 0 ? `<p class="budget-suggest-hint">Średnia z ostatnich 6 mies.: ${formatPlnAmount(suggested)}</p>` : '<p class="budget-suggest-hint">Brak wydatków w ostatnich 6 mies.</p>'}
        </div>`;
    }).join('');
}

function applyBudgetSuggestion(btn) {
    const cat = btn.dataset.cat;
    const input = btn.parentElement.querySelector('.budget-editor-input');
    const value = suggestCategoryBudget(cat);
    if (value > 0) input.value = value;
}

function saveBudgetEditor() {
    const inputs = document.querySelectorAll('#budget-editor-list .budget-editor-input');
    if (!appState.categoryBudgets) appState.categoryBudgets = {};
    inputs.forEach((input) => {
        const cat = input.dataset.cat;
        const value = Math.max(0, parseFloat(input.value) || 0);
        if (value > 0) appState.categoryBudgets[cat] = value;
        else delete appState.categoryBudgets[cat];
    });
    saveState();
    hapticFeedback();
    closeBudgetEditor();
    showSettingsToast('Limity zapisane');
}

function closeSettings() {
    document.getElementById('settings-overlay').classList.add('hidden');
    document.body.classList.remove('settings-open');
}

async function backupToCloud() {
    const count = getTransactionCount(appState);
    if (!confirm(`Na pewno wysłać kopię do chmury (${count} trans.)?\nPoprzednia kopia w chmurze zostanie zastąpiona.`)) return;

    const btn = document.getElementById('btn-backup-cloud');
    setSettingsButtonBusy(btn, true, 'Wysyłanie…');
    try {
        const payload = getExportPayload();
        await cloudBackupRef.set(payload);
        showSettingsToast('Kopia wysłana do chmury');
        refreshBackupInfo();
        hapticFeedback();
    } catch (err) {
        showSettingsToast('Nie udało się wysłać kopii', 'error');
        console.error(err);
    } finally {
        setSettingsButtonBusy(btn, false);
    }
}

function backupToPhone() {
    const btn = document.getElementById('btn-backup-phone');
    setSettingsButtonBusy(btn, true, 'Zapisywanie…');
    try {
        const payload = getExportPayload();
        localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(payload));
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `finanse-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        showSettingsToast('Kopia zapisana na telefonie');
        refreshBackupInfo();
        hapticFeedback();
    } catch (err) {
        showSettingsToast('Nie udało się zapisać kopii', 'error');
        console.error(err);
    } finally {
        setSettingsButtonBusy(btn, false);
    }
}

async function restoreFromCloud() {
    if (!confirm('Na pewno przywrócić kopię z chmury?\nObecne dane w aplikacji zostaną zastąpione.')) return;

    const btn = document.getElementById('btn-restore-cloud');
    setSettingsButtonBusy(btn, true, 'Pobieranie…');
    let payload;
    try {
        payload = await getCloudBackupPayload();
    } catch (err) {
        console.error('restoreFromCloud get', err);
        showSettingsToast('Nie udało się pobrać kopii z chmury', 'error');
        setSettingsButtonBusy(btn, false);
        return;
    }
    setSettingsButtonBusy(btn, false);
    if (!payload) {
        showSettingsToast('Brak kopii w chmurze', 'error');
        return;
    }
    const count = payload.transactionCount || payload.data?.transactions?.length || 0;
    if (!count) {
        showSettingsToast('Kopia w chmurze jest pusta', 'error');
        return;
    }
    setSettingsButtonBusy(btn, true, 'Przywracanie…');
    try {
        applyBackupPayload(payload);
        showSettingsToast(`Przywrócono ${count} transakcji z chmury`);
        refreshBackupInfo();
        hapticFeedback();
    } catch (err) {
        console.error('restoreFromCloud apply', err);
        showSettingsToast(err.message || 'Nie udało się przywrócić kopii', 'error');
    } finally {
        setSettingsButtonBusy(btn, false);
    }
}

function restoreFromPhoneFile() {
    if (!confirm('Na pewno przywrócić kopię z pliku?\nObecne dane w aplikacji zostaną zastąpione.')) return;
    document.getElementById('backup-file-input').click();
}

function handleBackupFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const btn = document.getElementById('btn-restore-file');
    setSettingsButtonBusy(btn, true, 'Wczytywanie…');
    const reader = new FileReader();
    reader.onload = () => {
        setSettingsButtonBusy(btn, false);
        try {
            const payload = JSON.parse(reader.result);
            const count = payload.transactionCount || payload.data?.transactions?.length || 0;
            if (!count) {
                showSettingsToast('Plik kopii jest pusty', 'error');
                return;
            }
            setSettingsButtonBusy(btn, true, 'Przywracanie…');
            applyBackupPayload(payload);
            localStorage.setItem(LOCAL_BACKUP_KEY, reader.result);
            showSettingsToast('Przywrócono kopię z pliku');
            refreshBackupInfo();
            hapticFeedback();
        } catch (err) {
            showSettingsToast('Nieprawidłowy plik kopii', 'error');
            console.error(err);
        } finally {
            setSettingsButtonBusy(btn, false);
        }
        event.target.value = '';
    };
    reader.onerror = () => {
        setSettingsButtonBusy(btn, false);
        showSettingsToast('Nie udało się odczytać pliku', 'error');
        event.target.value = '';
    };
    reader.readAsText(file);
}
