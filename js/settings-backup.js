/* Ustawienia — kopie zapasowe (eksport, import, chmura) */

function yieldToMain() {
    return new Promise((resolve) => {
        const schedule = () => window.setTimeout(resolve, 0);
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(schedule);
            return;
        }
        schedule();
    });
}

const BACKUP_RESTORE_PROGRESS_STEPS = [
    { id: 'fetch', label: 'Pobieranie z chmury', sources: ['cloud'] },
    { id: 'read', label: 'Wczytywanie pliku', sources: ['file'] },
    { id: 'validate', label: 'Sprawdzanie kopii', sources: ['cloud', 'file'] },
    { id: 'restore', label: 'Przywracanie danych', sources: ['cloud', 'file'] },
    { id: 'save', label: 'Zapis i synchronizacja', sources: ['cloud', 'file'] },
    { id: 'refresh', label: 'Odświeżanie widoków', sources: ['cloud', 'file'] },
    { id: 'done', label: 'Gotowe', sources: ['cloud', 'file'] }
];

let backupRestoreProgressState = null;
let backupRestoreProgressCloseTimer = null;

function getBackupRestoreProgressSteps(source) {
    return BACKUP_RESTORE_PROGRESS_STEPS.filter((step) => step.sources.includes(source));
}

function renderBackupRestoreProgressSteps() {
    const list = document.getElementById('backup-restore-progress-steps');
    if (!list || !backupRestoreProgressState) return;
    const { steps, currentStepId } = backupRestoreProgressState;
    const currentIdx = steps.findIndex((step) => step.id === currentStepId);
    list.innerHTML = steps.map((step, index) => {
        const isDone = currentStepId === 'done' || index < currentIdx;
        const isActive = !isDone && step.id === currentStepId;
        let stateClass = '';
        if (isDone) stateClass = ' backup-restore-progress-step--done';
        else if (isActive) stateClass = ' backup-restore-progress-step--active';
        return `<li class="backup-restore-progress-step${stateClass}">
            <span class="backup-restore-progress-step-icon" aria-hidden="true"></span>
            <span>${escapeHtml(step.label)}</span>
        </li>`;
    }).join('');
}

function showBackupRestoreProgress({ source = 'file' } = {}) {
    const overlay = document.getElementById('backup-restore-progress-overlay');
    const card = overlay?.querySelector('.backup-restore-progress-card');
    const actions = document.getElementById('backup-restore-progress-actions');
    const detail = document.getElementById('backup-restore-progress-detail');
    if (!overlay) return;
    if (backupRestoreProgressCloseTimer) {
        window.clearTimeout(backupRestoreProgressCloseTimer);
        backupRestoreProgressCloseTimer = null;
    }
    backupRestoreProgressState = {
        source,
        steps: getBackupRestoreProgressSteps(source),
        currentStepId: null
    };
    card?.classList.remove('backup-restore-progress-card--success', 'backup-restore-progress-card--error');
    actions?.classList.add('hidden');
    detail?.classList.add('hidden');
    if (detail) detail.textContent = '';
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    updateBackupRestoreProgress(source === 'cloud' ? 'fetch' : 'read');
}

function updateBackupRestoreProgress(stepId, detailText = '') {
    if (!backupRestoreProgressState) return;
    const step = backupRestoreProgressState.steps.find((item) => item.id === stepId);
    if (!step) return;
    backupRestoreProgressState.currentStepId = stepId;
    const status = document.getElementById('backup-restore-progress-status');
    const detail = document.getElementById('backup-restore-progress-detail');
    if (status) status.textContent = step.label;
    renderBackupRestoreProgressSteps();
    if (detail) {
        const text = String(detailText || '').trim();
        detail.textContent = text;
        detail.classList.toggle('hidden', !text);
    }
}

function closeBackupRestoreProgress() {
    const overlay = document.getElementById('backup-restore-progress-overlay');
    if (backupRestoreProgressCloseTimer) {
        window.clearTimeout(backupRestoreProgressCloseTimer);
        backupRestoreProgressCloseTimer = null;
    }
    backupRestoreProgressState = null;
    overlay?.classList.add('hidden');
    overlay?.setAttribute('aria-hidden', 'true');
    if (!document.body.classList.contains('settings-open')
        && !document.body.classList.contains('notifications-open')) {
        document.body.style.overflow = '';
    }
}

function finishBackupRestoreProgress(message, detailText = '') {
    updateBackupRestoreProgress('done', detailText);
    const card = document.querySelector('.backup-restore-progress-card');
    const status = document.getElementById('backup-restore-progress-status');
    card?.classList.add('backup-restore-progress-card--success');
    if (status) status.textContent = message || 'Kopia została przywrócona';
    backupRestoreProgressCloseTimer = window.setTimeout(() => {
        closeBackupRestoreProgress();
        if (message && typeof showSettingsToast === 'function') showSettingsToast(message);
    }, 1400);
}

function failBackupRestoreProgress(message) {
    const card = document.querySelector('.backup-restore-progress-card');
    const status = document.getElementById('backup-restore-progress-status');
    const actions = document.getElementById('backup-restore-progress-actions');
    card?.classList.add('backup-restore-progress-card--error');
    if (status) status.textContent = message || 'Nie udało się przywrócić kopii';
    actions?.classList.remove('hidden');
}

function getExportPayload() {
    const data = getPersistedState(appState);
    const archivedTransactions = typeof getArchivedTransactions === 'function'
        ? getArchivedTransactions()
        : [];
    const monthCloseState = typeof readMonthCloseState === 'function'
        ? readMonthCloseState()
        : {};
    return {
        version: 2,
        exportedAt: new Date().toISOString(),
        transactionCount: data.transactions.length + archivedTransactions.length,
        archivedTransactions,
        monthCloseState,
        data
    };
}

function finishBackupRestoreUi() {
    if (typeof closeCloudRestorePicker === 'function') closeCloudRestorePicker();
    document.body.style.overflow = '';
}

async function applyBackupPayloadAsync(payload, options = {}) {
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    onProgress('validate');
    await yieldToMain();
    const { data, archivedTransactions, report } = validateBackupPayload(payload);
    const transactionCount = (data.transactions?.length || 0) + (archivedTransactions?.length || 0);
    const todoCount = data.todos?.length || 0;
    const rulesCount = data.categoryRules?.length || 0;
    const restoreDetail = [
        transactionCount ? `${transactionCount} trans.` : '',
        rulesCount ? `${rulesCount} reguł` : '',
        todoCount ? `${todoCount} zadań` : ''
    ].filter(Boolean).join(' · ');
    onProgress('restore', restoreDetail);
    await yieldToMain();
    if (typeof setArchivedTransactions === 'function') {
        setArchivedTransactions(archivedTransactions);
    } else if (Array.isArray(archivedTransactions) && archivedTransactions.length
        && typeof restoreArchivedTransactionsFromBackup === 'function') {
        restoreArchivedTransactionsFromBackup(archivedTransactions);
    }
    normalizeAppState(data);
    if (payload.monthCloseState && typeof payload.monthCloseState === 'object'
        && typeof writeMonthCloseState === 'function') {
        writeMonthCloseState(payload.monthCloseState);
    }
    cloudSyncUnlocked = true;
    onProgress('save');
    await yieldToMain();
    try {
        localStorage.setItem(getFinanceStorageKey(), JSON.stringify(getPersistedState(appState)));
    } catch (err) {
        throw new Error('Brak miejsca w pamięci telefonu — zwolnij miejsce w Safari.');
    }
    saveState({ forceCloud: true });
    setSyncStatus('online', getTransactionCount(appState));
    finishBackupRestoreUi();
    onProgress('refresh');
    await yieldToMain();
    try {
        refreshCurrentView();
        if (typeof renderCategoryRulesEditor === 'function') renderCategoryRulesEditor();
        if (typeof renderTasksView === 'function') renderTasksView();
    } catch (err) {
        console.error('refreshCurrentView after restore', err);
    }
    const importNote = typeof formatBackupImportReport === 'function'
        ? formatBackupImportReport(report)
        : '';
    if (importNote) {
        console.info('Import kopii:', importNote);
    }
    return { report, importNote, transactionCount };
}

function applyBackupPayload(payload) {
    return applyBackupPayloadAsync(payload);
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

function isCloudBackupAvailable() {
    return !!(cloudBackupSnapshotsRef && cloudBackupRef);
}

async function ensureCloudBackupsReady() {
    const uid = typeof auth !== 'undefined' && auth?.currentUser?.uid
        ? auth.currentUser.uid
        : null;
    if (uid && typeof migrateLegacyCloudBackupsIfNeeded === 'function') {
        await migrateLegacyCloudBackupsIfNeeded(uid);
    }
}

async function refreshBackupInfo() {
    const cloudEl = document.getElementById('backup-cloud-info');
    const localEl = document.getElementById('backup-local-info');
    if (cloudEl) cloudEl.textContent = 'Sprawdzanie…';

    if (!isCloudBackupAvailable()) {
        if (cloudEl) {
            cloudEl.textContent = auth?.currentUser
                ? 'Chmura niedostępna — odśwież aplikację'
                : 'Zaloguj się, aby korzystać z chmury';
        }
    } else {
        try {
            await ensureCloudBackupsReady();
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
    }
    const localRaw = localStorage.getItem(getLocalBackupStorageKey());
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
async function backupToCloud() {
    if (!isCloudBackupAvailable()) {
        showSettingsToast('Chmura niedostępna — zaloguj się ponownie', 'error');
        return;
    }
    const count = getTransactionCount(appState);
    if (!confirm(`Na pewno wysłać kopię do chmury (${count} trans.)?\nZostanie dodana jako ręczna wersja (przechowujemy do ${MAX_CLOUD_BACKUP_SNAPSHOTS_MANUAL} ręcznych kopii).`)) return;

    const btn = document.getElementById('btn-backup-cloud');
    setSettingsButtonBusy(btn, true, 'Wysyłanie…');
    try {
        await yieldToMain();
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

async function backupToPhone() {
    const btn = document.getElementById('btn-backup-phone');
    setSettingsButtonBusy(btn, true, 'Zapisywanie…');
    try {
        await yieldToMain();
        const payload = getExportPayload();
        const json = JSON.stringify(payload);
        await yieldToMain();
        localStorage.setItem(getLocalBackupStorageKey(), json);
        const blob = new Blob([json], { type: 'application/json' });
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
    await yieldToMain();

    try {
        const ready = typeof withFirestoreTimeout === 'function'
            ? withFirestoreTimeout(ensureCloudBackupsReady(), 12000)
            : ensureCloudBackupsReady();
        await ready;
        const snapshots = typeof withFirestoreTimeout === 'function'
            ? await withFirestoreTimeout(listCloudBackupSnapshots(), 12000)
            : await listCloudBackupSnapshots();
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
        list.innerHTML = '<p class="cloud-restore-status cloud-restore-status--error">Nie udało się pobrać listy kopii — sprawdź internet i spróbuj ponownie</p>';
    }
}

async function restoreCloudBackupById(id) {
    const snapshots = await listCloudBackupSnapshots();
    const meta = snapshots.find((item) => item.id === id);
    const dateLabel = meta ? formatCloudBackupDate(meta.exportedAt) : 'wybraną';
    if (!confirm(`Na pewno przywrócić kopię z ${dateLabel}?\nObecne dane w aplikacji zostaną zastąpione.`)) return;

    showBackupRestoreProgress({ source: 'cloud' });
    let payload;
    try {
        payload = await getCloudBackupSnapshotById(id);
    } catch (err) {
        console.error('restoreCloudBackupById get', err);
        failBackupRestoreProgress('Nie udało się pobrać kopii z chmury');
        return;
    }
    if (!payload) {
        failBackupRestoreProgress('Nie znaleziono wybranej kopii');
        return;
    }
    const count = payload.transactionCount || payload.data?.transactions?.length || 0;
    if (!count) {
        failBackupRestoreProgress('Wybrana kopia jest pusta');
        return;
    }
    try {
        const { importNote } = await applyBackupPayloadAsync(payload, { onProgress: updateBackupRestoreProgress });
        const detail = importNote ? `${count} trans. · ${importNote}` : `${count} trans.`;
        finishBackupRestoreProgress(
            importNote ? `Przywrócono ${count} transakcji (${importNote})` : `Przywrócono ${count} transakcji`,
            detail
        );
        refreshBackupInfo();
        hapticFeedback();
    } catch (err) {
        console.error('restoreCloudBackupById apply', err);
        failBackupRestoreProgress(err.message || 'Nie udało się przywrócić kopii');
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
    showBackupRestoreProgress({ source: 'file' });
    updateBackupRestoreProgress('read', file.name);
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const payload = JSON.parse(reader.result);
            const count = payload.transactionCount || payload.data?.transactions?.length || 0;
            if (!count) {
                failBackupRestoreProgress('Plik kopii jest pusty');
                return;
            }
            const { importNote } = await applyBackupPayloadAsync(payload, { onProgress: updateBackupRestoreProgress });
            localStorage.setItem(getLocalBackupStorageKey(), reader.result);
            const detail = importNote ? `${count} trans. · ${importNote}` : `${count} trans.`;
            finishBackupRestoreProgress(
                importNote ? `Przywrócono kopię z pliku (${importNote})` : 'Przywrócono kopię z pliku',
                detail
            );
            refreshBackupInfo();
            hapticFeedback();
        } catch (err) {
            failBackupRestoreProgress(err.message || 'Nieprawidłowy plik kopii');
            console.error(err);
        }
        event.target.value = '';
    };
    reader.onerror = () => {
        failBackupRestoreProgress('Nie udało się odczytać pliku');
        event.target.value = '';
    };
    reader.readAsText(file);
}
