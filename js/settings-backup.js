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

async function applyBackupPayloadAsync(payload) {
    await yieldToMain();
    const { data, archivedTransactions, report } = validateBackupPayload(payload);
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
    await yieldToMain();
    try {
        localStorage.setItem(getFinanceStorageKey(), JSON.stringify(getPersistedState(appState)));
    } catch (err) {
        throw new Error('Brak miejsca w pamięci telefonu — zwolnij miejsce w Safari.');
    }
    saveState({ forceCloud: true });
    setSyncStatus('online', getTransactionCount(appState));
    finishBackupRestoreUi();
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
    return { report, importNote };
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
        const { importNote } = await applyBackupPayloadAsync(payload);
        showSettingsToast(importNote
            ? `Przywrócono ${count} transakcji z chmury (${importNote})`
            : `Przywrócono ${count} transakcji z chmury`);
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
    reader.onload = async () => {
        setSettingsButtonBusy(btn, false);
        try {
            const payload = JSON.parse(reader.result);
            const count = payload.transactionCount || payload.data?.transactions?.length || 0;
            if (!count) {
                showSettingsToast('Plik kopii jest pusty', 'error');
                return;
            }
            setSettingsButtonBusy(btn, true, 'Przywracanie…');
            const { importNote } = await applyBackupPayloadAsync(payload);
            localStorage.setItem(getLocalBackupStorageKey(), reader.result);
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
