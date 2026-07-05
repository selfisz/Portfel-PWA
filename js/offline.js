let offlineSessionActive = false;

function isAppOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function hasLocalFinanceData() {
    try {
        if (typeof getFinanceStorageKey === 'function') {
            const active = getFinanceStorageKey();
            if (active && localStorage.getItem(active)) return true;
        }
        if (localStorage.getItem(STORAGE_KEY)) return true;
        const prefix = `${STORAGE_KEY}_`;
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (key?.startsWith(prefix) && localStorage.getItem(key)) return true;
        }
        if (localStorage.getItem(LOCAL_BACKUP_KEY)) return true;
    } catch {
        return false;
    }
    return false;
}

function findStoredFinanceUid() {
    const prefix = `${STORAGE_KEY}_`;
    let bestUid = null;
    let bestCount = -1;
    try {
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (!key?.startsWith(prefix) || key.length <= prefix.length) continue;
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            let count = 0;
            try {
                const data = JSON.parse(raw);
                count = Array.isArray(data?.transactions) ? data.transactions.length : 0;
            } catch {
                continue;
            }
            if (count >= bestCount) {
                bestCount = count;
                bestUid = key.slice(prefix.length);
            }
        }
    } catch {
        return null;
    }
    return bestUid;
}

function showOfflineBanner(force = false) {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    if (!force && !isAppOffline() && !offlineSessionActive) return;
    banner.classList.remove('hidden');
}

function hideOfflineBanner() {
    document.getElementById('offline-banner')?.classList.add('hidden');
}

function isOfflineSessionActive() {
    return offlineSessionActive;
}

async function bootstrapOfflineSession() {
    if (!hasLocalFinanceData()) {
        return false;
    }

    const uid = findStoredFinanceUid();
    if (typeof setFinanceStorageKey === 'function') {
        setFinanceStorageKey(uid || null);
    }

    if (typeof loadLocalFinanceState !== 'function' || !loadLocalFinanceState()) {
        return false;
    }

    offlineSessionActive = true;
    if (typeof authReady !== 'undefined') authReady = true;

    if (typeof cloudSyncUnlocked !== 'undefined') cloudSyncUnlocked = false;
    if (typeof hideAuthOverlay === 'function') hideAuthOverlay();

    const count = typeof getTransactionCount === 'function' ? getTransactionCount(appState) : 0;
    if (typeof setSyncStatus === 'function') setSyncStatus('offline', count);
    showOfflineBanner(true);

    if (typeof bootstrapApp === 'function') bootstrapApp();
    if (typeof initAppLock === 'function') initAppLock();
    if (typeof maybeRequireAppLock === 'function') maybeRequireAppLock({ reason: 'startup' });
    if (typeof registerServiceWorker === 'function') registerServiceWorker();
    return true;
}

function clearOfflineSession() {
    offlineSessionActive = false;
    hideOfflineBanner();
}

function formatOfflineSyncSuccessMessage(txCount) {
    const count = Number.isFinite(txCount) ? txCount : 0;
    if (count === 1) return 'Zsynchronizowano z chmurą (1 transakcja)';
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
        return `Zsynchronizowano z chmurą (${count} transakcje)`;
    }
    return `Zsynchronizowano z chmurą (${count} transakcji)`;
}

function initOfflineListeners() {
    if (typeof window === 'undefined' || initOfflineListeners._done) return;
    initOfflineListeners._done = true;

    if (isAppOffline()) {
        showOfflineBanner();
        if (typeof setSyncStatus === 'function') {
            const count = typeof getTransactionCount === 'function' ? getTransactionCount(appState) : 0;
            setSyncStatus('offline', count);
        }
    }

    window.addEventListener('offline', () => {
        if (typeof setSyncStatus === 'function') {
            const count = typeof getTransactionCount === 'function' ? getTransactionCount(appState) : 0;
            setSyncStatus('offline', count);
        }
        showOfflineBanner(true);
    });

    window.addEventListener('online', () => {
        hideOfflineBanner();
        if (offlineSessionActive && typeof auth !== 'undefined' && auth.currentUser) {
            offlineSessionActive = false;
            if (typeof handleAuthenticatedUser === 'function') {
                handleAuthenticatedUser(auth.currentUser).catch((err) => {
                    console.error('handleAuthenticatedUser after online', err);
                });
            }
        }
    });
}
