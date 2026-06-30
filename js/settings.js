function getExportPayload() {
    const data = getPersistedState(appState);
    const archivedTransactions = typeof getArchivedTransactions === 'function'
        ? getArchivedTransactions()
        : [];
    return {
        version: 2,
        exportedAt: new Date().toISOString(),
        transactionCount: data.transactions.length + archivedTransactions.length,
        archivedTransactions,
        data
    };
}

function applyBackupPayload(payload) {
    const { data, archivedTransactions, report } = validateBackupPayload(payload);
    if (typeof setArchivedTransactions === 'function') {
        setArchivedTransactions(archivedTransactions);
    } else if (Array.isArray(archivedTransactions) && archivedTransactions.length
        && typeof restoreArchivedTransactionsFromBackup === 'function') {
        restoreArchivedTransactionsFromBackup(archivedTransactions);
    }
    normalizeAppState(data);
    cloudSyncUnlocked = true;
    try {
        localStorage.setItem(getFinanceStorageKey(), JSON.stringify(getPersistedState(appState)));
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
    const importNote = typeof formatBackupImportReport === 'function'
        ? formatBackupImportReport(report)
        : '';
    if (importNote) {
        console.info('Import kopii:', importNote);
    }
    return { report, importNote };
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

function formatCloudBackupDate(value) {
    if (!value) return '—';
    const date = new Date(typeof value === 'string' ? value : value.toDate?.() || value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('pl-PL');
}

function formatCloudBackupCount(count) {
    if (count === 1) return '1 kopia';
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} kopie`;
    return `${count} kopii`;
}

function getAutoCloudBackupDateStorageKey() {
    const uid = typeof auth !== 'undefined' && auth?.currentUser?.uid
        ? auth.currentUser.uid
        : '';
    return uid ? `${LAST_AUTO_CLOUD_BACKUP_DATE_KEY}_${uid}` : LAST_AUTO_CLOUD_BACKUP_DATE_KEY;
}

function isAutoCloudBackupEnabled() {
    try {
        const raw = localStorage.getItem(AUTO_CLOUD_BACKUP_ENABLED_KEY);
        if (raw === null) return true;
        return raw === '1' || raw === 'true';
    } catch {
        return true;
    }
}

function setAutoCloudBackupEnabled(enabled) {
    try {
        localStorage.setItem(AUTO_CLOUD_BACKUP_ENABLED_KEY, enabled ? '1' : '0');
    } catch { /* ignore */ }
    syncAutoCloudBackupToggleUI();
}

function syncAutoCloudBackupToggleUI() {
    const el = document.getElementById('auto-cloud-backup-toggle');
    if (el) el.checked = isAutoCloudBackupEnabled();
}

function onAutoCloudBackupToggle() {
    const el = document.getElementById('auto-cloud-backup-toggle');
    const enabled = !!el?.checked;
    setAutoCloudBackupEnabled(enabled);
    if (enabled && typeof maybeRunAutoCloudBackup === 'function') {
        maybeRunAutoCloudBackup();
    }
}

function getTodayDateKey() {
    return new Date().toISOString().slice(0, 10);
}

function getLastAutoCloudBackupDate() {
    try {
        return localStorage.getItem(getAutoCloudBackupDateStorageKey()) || '';
    } catch {
        return '';
    }
}

function setLastAutoCloudBackupDate(dateKey) {
    try {
        localStorage.setItem(getAutoCloudBackupDateStorageKey(), dateKey);
    } catch { /* ignore */ }
}

let autoCloudBackupInFlight = false;

async function maybeRunAutoCloudBackup() {
    if (autoCloudBackupInFlight) return;
    if (!isAutoCloudBackupEnabled()) return;
    if (!cloudBackupSnapshotsRef || !cloudBackupRef) return;

    const today = getTodayDateKey();
    if (getLastAutoCloudBackupDate() === today) return;

    const count = getTransactionCount(appState);
    if (count < 1) return;

    autoCloudBackupInFlight = true;
    try {
        const payload = getExportPayload();
        await saveCloudBackupSnapshot(payload, { source: 'auto' });
        setLastAutoCloudBackupDate(today);
        const settingsOpen = !document.getElementById('settings-overlay')?.classList.contains('hidden');
        if (settingsOpen && settingsSection === 'backup') refreshBackupInfo();
    } catch (err) {
        console.warn('maybeRunAutoCloudBackup', err);
    } finally {
        autoCloudBackupInFlight = false;
    }
}

function formatCloudBackupSourceLabel(source) {
    return source === 'auto' ? 'auto' : 'ręczna';
}

async function refreshBackupInfo() {
    const cloudEl = document.getElementById('backup-cloud-info');
    const localEl = document.getElementById('backup-local-info');
    if (cloudEl) cloudEl.textContent = 'Sprawdzanie…';
    try {
        const snapshots = await listCloudBackupSnapshots();
        if (snapshots.length) {
            const latest = snapshots[0];
            const date = formatCloudBackupDate(latest.exportedAt);
            const autoCount = snapshots.filter((s) => s.backupSource === 'auto').length;
            const manualCount = snapshots.length - autoCount;
            const autoToday = isAutoCloudBackupEnabled() && getLastAutoCloudBackupDate() === getTodayDateKey();
            if (cloudEl) {
                cloudEl.textContent = `${formatCloudBackupCount(snapshots.length)} (${manualCount} ręczn., ${autoCount} auto) · ostatnia ${date} · ${latest.transactionCount} trans.`;
            }
            const autoHint = document.getElementById('auto-cloud-backup-status');
            if (autoHint) {
                if (!isAutoCloudBackupEnabled()) {
                    autoHint.textContent = 'Automatyczna kopia wyłączona.';
                } else if (autoToday) {
                    autoHint.textContent = 'Dzisiejsza automatyczna kopia jest już zapisana.';
                } else {
                    autoHint.textContent = 'Automatyczna kopia zostanie utworzona przy następnym uruchomieniu aplikacji.';
                }
            }
        } else if (cloudEl) {
            cloudEl.textContent = 'Brak kopii w chmurze';
            const autoHint = document.getElementById('auto-cloud-backup-status');
            if (autoHint) {
                autoHint.textContent = isAutoCloudBackupEnabled()
                    ? 'Automatyczna kopia zostanie utworzona przy pierwszym uruchomieniu z danymi.'
                    : 'Automatyczna kopia wyłączona.';
            }
        }
    } catch {
        if (cloudEl) cloudEl.textContent = 'Niedostępna — brak połączenia';
        const autoHint = document.getElementById('auto-cloud-backup-status');
        if (autoHint && !isAutoCloudBackupEnabled()) {
            autoHint.textContent = 'Automatyczna kopia wyłączona.';
        }
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
    if (section === 'budgets') renderBudgetEditor();
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

function filterBudgetEditorList(query) {
    const q = String(query || '').trim().toLowerCase();
    document.querySelectorAll('#settings-budget-list .budget-limit-group').forEach((group) => {
        const hay = (group.dataset.search || '').toLowerCase();
        group.classList.toggle('hidden', q.length > 0 && !hay.includes(q));
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
    const subsOpen = mainBudget > 0 || hasSubBudget;
    const suggested = suggestCategoryBudget(cat);
    const usage = renderBudgetLimitUsageBlock(cat, null, suggested);
    const subRows = subs.map((sub) => renderBudgetLimitSubRow(cat, sub)).join('');
    const searchBlob = [cat, ...subs].join(' ');
    const subsToggle = subs.length
        ? `<button type="button" class="budget-limit-subs-toggle" aria-expanded="${subsOpen ? 'true' : 'false'}" aria-label="Pokaż podkategorie" onclick="toggleBudgetLimitSubs(this)">
            <span class="budget-limit-subs-label">Podkategorie (${subs.length})</span>
            <svg class="budget-limit-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
        </button>`
        : '';
    return `<div class="budget-status-group budget-limit-group${subsOpen ? ' budget-limit-group--subs-open' : ''}" data-search="${escapeHtml(searchBlob)}">
        <div class="budget-limit-head">
            ${renderCategoryIcon(cat, 'list', null, 'expense')}
            <span class="budget-limit-title">${escapeHtml(cat)}</span>
        </div>
        <div class="budget-limit-panel">
            ${renderBudgetLimitField('main', cat, null, { kind: 'main', cat }, suggested)}
            ${usage}
        </div>
        ${subs.length ? `${subsToggle}<div class="budget-limit-subs">${subRows}</div>` : ''}
    </div>`;
}

function renderBudgetEditor() {
    const list = getBudgetEditorListEl();
    if (!list) return;
    const categories = Object.keys(categoryTree.expense || {});
    const toolbar = `<div class="budget-editor-toolbar">
        <input type="search" class="budget-editor-search" placeholder="Szukaj kategorii…" oninput="filterBudgetEditorList(this.value)" aria-label="Szukaj kategorii">
        <button type="button" class="btn-outline btn-outline--compact budget-editor-fill-all" onclick="applyAllBudgetSuggestions()">Średnia 6m</button>
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
}

async function backupToCloud() {
    const count = getTransactionCount(appState);
    if (!confirm(`Na pewno wysłać kopię do chmury (${count} trans.)?\nZostanie dodana jako ręczna wersja (przechowujemy do ${MAX_CLOUD_BACKUP_SNAPSHOTS_MANUAL} ręcznych kopii).`)) return;

    const btn = document.getElementById('btn-backup-cloud');
    setSettingsButtonBusy(btn, true, 'Wysyłanie…');
    try {
        const payload = getExportPayload();
        await saveCloudBackupSnapshot(payload, { source: 'manual' });
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

function closeCloudRestorePicker() {
    document.getElementById('cloud-restore-overlay')?.classList.add('hidden');
}

function renderCloudRestoreRow(snapshot, isLatest) {
    const date = formatCloudBackupDate(snapshot.exportedAt);
    const latestBadge = isLatest
        ? '<span class="cloud-restore-badges"><span class="cloud-restore-badge">najnowsza</span></span>'
        : '';
    return `<button type="button" class="cloud-restore-row" data-backup-id="${escapeHtml(snapshot.id)}">
        <span class="cloud-restore-row-main">
            <span class="cloud-restore-date">${escapeHtml(date)}</span>
            ${latestBadge}
        </span>
        <span class="cloud-restore-meta">${snapshot.transactionCount} trans.</span>
    </button>`;
}

function renderCloudRestoreSection(title, snapshots, latestId) {
    const rows = snapshots.length
        ? snapshots.map((snapshot) => renderCloudRestoreRow(snapshot, snapshot.id === latestId)).join('')
        : '<p class="cloud-restore-section-empty">Brak kopii</p>';
    return `<div class="cloud-restore-section">
        <div class="cloud-restore-section-title">${escapeHtml(title)}</div>
        ${rows}
    </div>`;
}

async function openCloudRestorePicker() {
    const overlay = document.getElementById('cloud-restore-overlay');
    const list = document.getElementById('cloud-restore-list');
    if (!overlay || !list) return;
    overlay.classList.remove('hidden');
    list.innerHTML = '<p class="cloud-restore-status">Ładowanie kopii…</p>';

    try {
        const snapshots = await listCloudBackupSnapshots();
        if (!snapshots.length) {
            list.innerHTML = '<p class="cloud-restore-status">Brak kopii w chmurze</p>';
            return;
        }
        const latestId = snapshots[0]?.id || null;
        const autoSnapshots = snapshots.filter((snapshot) => snapshot.backupSource === 'auto');
        const manualSnapshots = snapshots.filter((snapshot) => snapshot.backupSource !== 'auto');
        list.innerHTML = [
            renderCloudRestoreSection('Automatyczne', autoSnapshots, latestId),
            renderCloudRestoreSection('Ręczne', manualSnapshots, latestId)
        ].join('');
        list.onclick = (event) => {
            const row = event.target.closest('[data-backup-id]');
            if (row?.dataset.backupId) restoreCloudBackupById(row.dataset.backupId);
        };
    } catch (err) {
        console.error('openCloudRestorePicker', err);
        list.innerHTML = '<p class="cloud-restore-status cloud-restore-status--error">Nie udało się pobrać listy kopii</p>';
    }
}

async function restoreCloudBackupById(id) {
    const snapshots = await listCloudBackupSnapshots();
    const meta = snapshots.find((item) => item.id === id);
    const dateLabel = meta ? formatCloudBackupDate(meta.exportedAt) : 'wybraną';
    if (!confirm(`Na pewno przywrócić kopię z ${dateLabel}?\nObecne dane w aplikacji zostaną zastąpione.`)) return;

    const btn = document.getElementById('btn-restore-cloud');
    setSettingsButtonBusy(btn, true, 'Pobieranie…');
    let payload;
    try {
        payload = await getCloudBackupSnapshotById(id);
    } catch (err) {
        console.error('restoreCloudBackupById get', err);
        showSettingsToast('Nie udało się pobrać kopii z chmury', 'error');
        setSettingsButtonBusy(btn, false);
        return;
    }
    setSettingsButtonBusy(btn, false);
    if (!payload) {
        showSettingsToast('Nie znaleziono wybranej kopii', 'error');
        return;
    }
    const count = payload.transactionCount || payload.data?.transactions?.length || 0;
    if (!count) {
        showSettingsToast('Wybrana kopia jest pusta', 'error');
        return;
    }
    setSettingsButtonBusy(btn, true, 'Przywracanie…');
    try {
        const { importNote } = applyBackupPayload(payload);
        showSettingsToast(importNote
            ? `Przywrócono ${count} transakcji z chmury (${importNote})`
            : `Przywrócono ${count} transakcji z chmury`);
        closeCloudRestorePicker();
        refreshBackupInfo();
        hapticFeedback();
    } catch (err) {
        console.error('restoreCloudBackupById apply', err);
        showSettingsToast(err.message || 'Nie udało się przywrócić kopii', 'error');
    } finally {
        setSettingsButtonBusy(btn, false);
    }
}

function restoreFromCloud() {
    openCloudRestorePicker();
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
            const { importNote } = applyBackupPayload(payload);
            localStorage.setItem(LOCAL_BACKUP_KEY, reader.result);
            showSettingsToast(importNote ? `Przywrócono kopię z pliku (${importNote})` : 'Przywrócono kopię z pliku');
            refreshBackupInfo();
            hapticFeedback();
        } catch (err) {
            showSettingsToast(err.message || 'Nieprawidłowy plik kopii', 'error');
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
