let stateSnapshotUnsubscribe = null;
let cloudSnapshotSyncTimeout = null;
let cloudAutoRecoverChecked = false;

function shouldAttemptCloudAutoRecover() {
    if (cloudAutoRecoverChecked) return false;
    if (typeof isDemoFinanceSession === 'function' && isDemoFinanceSession()) return false;
    if (typeof hasPendingCloudSync === 'function' && hasPendingCloudSync()) return false;
    if (typeof isAutoCloudRecoverDone === 'function' && isAutoCloudRecoverDone()) return false;
    const memoryCount = typeof getTransactionCount === 'function' ? getTransactionCount(appState) : 0;
    if (memoryCount > 0) return false;
    const storedRaw = typeof readStoredAppStateRaw === 'function' ? readStoredAppStateRaw() : null;
    const storedCount = storedRaw && typeof getTransactionCount === 'function'
        ? getTransactionCount(storedRaw)
        : 0;
    return storedCount === 0;
}

function markCloudAutoRecoverChecked() {
    cloudAutoRecoverChecked = true;
}

function clearCloudSnapshotSyncTimeout() {
    if (cloudSnapshotSyncTimeout) {
        window.clearTimeout(cloudSnapshotSyncTimeout);
        cloudSnapshotSyncTimeout = null;
    }
}

function settleCloudSyncIndicator() {
    const count = getTransactionCount(appState);
    const statusEl = document.getElementById('sync-status');
    if (!statusEl || statusEl.className) return;
    if (count > 0) setSyncStatus('online', count);
    else setSyncStatus('offline', 0);
}

function stopCloudSync() {
    if (stateSnapshotUnsubscribe) {
        stateSnapshotUnsubscribe();
        stateSnapshotUnsubscribe = null;
    }
    clearCloudSnapshotSyncTimeout();
}

function startCloudSnapshotSync() {
    if (!stateRef || typeof stateRef.onSnapshot !== 'function') return;

    stopCloudSync();

    cloudSnapshotSyncTimeout = window.setTimeout(settleCloudSyncIndicator, 12000);

    const clearSyncTimeout = () => {
        clearCloudSnapshotSyncTimeout();
    };

    const demoSession = typeof isDemoFinanceSession === 'function' && isDemoFinanceSession();

    if (demoSession && typeof hydrateDemoFinanceFromServer === 'function') {
        hydrateDemoFinanceFromServer().then((hydrated) => {
            if (hydrated) clearSyncTimeout();
        }).catch((err) => {
            console.warn('hydrateDemoFinanceFromServer', err);
        });
    } else if (shouldAttemptCloudAutoRecover()) {
        markCloudAutoRecoverChecked();
        autoRecoverFromCloudBackupIfNeeded().then((recovered) => {
            if (recovered) clearSyncTimeout();
        });
    }

    stateSnapshotUnsubscribe = stateRef.onSnapshot({ includeMetadataChanges: true }, (docSnap) => {
        if (demoSession && docSnap.metadata.fromCache) return;
        if (docSnap.metadata.hasPendingWrites) return;
        if (typeof isCloudSyncBlockingRemoteApply === 'function' && isCloudSyncBlockingRemoteApply()) return;
        clearSyncTimeout();
        if (docSnap.exists) {
            syncFromRemoteData(docSnap.data(), { fromCache: docSnap.metadata.fromCache === true });
            return;
        }
        cloudSyncUnlocked = true;
        const count = getTransactionCount(appState);
        if (count > 0 && typeof isDemoFinanceCloudWriteAllowed === 'function' && isDemoFinanceCloudWriteAllowed()) {
            saveState({ forceCloud: true });
        } else if (count === 0) {
            setSyncStatus('online', 0);
        }
    }, (error) => {
        console.error('Błąd synchronizacji', error);
        clearSyncTimeout();
        const count = getTransactionCount(appState);
        if (count > 0) setSyncStatus('offline', count);
        else settleCloudSyncIndicator();
        if (shouldAttemptCloudAutoRecover()) {
            markCloudAutoRecoverChecked();
            autoRecoverFromCloudBackupIfNeeded().finally(() => {
                clearSyncTimeout();
                settleCloudSyncIndicator();
            });
        }
    });
}

function reconnectCloudSnapshotSync(options = {}) {
    if (typeof isUserSignedIn === 'function' && !isUserSignedIn()) return;
    if (typeof isAppOffline === 'function' && isAppOffline()) return;
    if (!stateRef || typeof stateRef.onSnapshot !== 'function') return;

    const force = options.force === true;
    const statusEl = document.getElementById('sync-status');
    const mode = statusEl?.className || '';
    const needsReconnect = force
        || !stateSnapshotUnsubscribe
        || mode === 'offline'
        || mode === 'pending';

    if (!needsReconnect) return;
    startCloudSnapshotSync();
}

async function flushOfflineChangesAfterOnline(options = {}) {
    if (isAppOffline()) return false;
    if (typeof isUserSignedIn !== 'function' || !isUserSignedIn()) return false;

    const hadPending = typeof hasPendingCloudSync === 'function' && hasPendingCloudSync();
    const wasOfflineSession = typeof isOfflineSessionActive === 'function' && isOfflineSessionActive();
    if (!hadPending && !wasOfflineSession) return false;

    const txCount = typeof getTransactionCount === 'function' ? getTransactionCount(appState) : 0;
    let synced = false;

    if (typeof resumePendingCloudSync === 'function') {
        synced = await resumePendingCloudSync({ force: true, silent: true });
    }

    if (!synced && hadPending && typeof flushCloudSync === 'function' && typeof getPersistedState === 'function') {
        synced = await flushCloudSync(getPersistedState(appState), { forceCloud: true });
    }

    const allowToast = options.allowToast !== false;
    if (allowToast && typeof showAppToast === 'function') {
        if (synced) {
            showAppToast(formatOfflineSyncSuccessMessage(txCount), 'success');
        } else if (hadPending || wasOfflineSession) {
            showAppToast('Synchronizacja nie powiodła się — dotknij kropki, aby ponowić', 'error');
        }
    }

    return synced;
}

function bindSyncStatusControl() {
    const statusEl = document.getElementById('sync-status');
    if (!statusEl || statusEl.dataset.syncBound) return;
    statusEl.dataset.syncBound = '1';
    statusEl.setAttribute('role', 'button');
    statusEl.setAttribute('tabindex', '0');
    statusEl.setAttribute('aria-label', 'Status synchronizacji — dotknij, aby ponowić');
    statusEl.addEventListener('click', () => retryCloudSyncNow());
    statusEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            retryCloudSyncNow();
        }
    });
}

function initSyncLifecycleListeners() {
    if (typeof window === 'undefined' || initSyncLifecycleListeners._done) return;
    initSyncLifecycleListeners._done = true;

    window.addEventListener('online', () => {
        cloudSyncRetryAttempt = 0;
        clearCloudSyncRetryTimer();
        flushOfflineChangesAfterOnline({ allowToast: false }).catch((err) => {
            console.warn('flushOfflineChangesAfterOnline', err);
        });
        reconnectCloudSnapshotSync({ force: true });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (hasPendingCloudSync()) {
            resumePendingCloudSync({ silent: true });
        }
        reconnectCloudSnapshotSync();
    });

    bindSyncStatusControl();

    if (hasPendingCloudSync()) {
        resumePendingCloudSync({ silent: true });
    }
}

/** @deprecated użyj initSyncLifecycleListeners */
function initCloudSyncListeners() {
    initSyncLifecycleListeners();
}
