let cloudSyncInFlight = null;
let cloudSyncRetryTimer = null;
let cloudSyncRetryAttempt = 0;

function canPushPayloadToCloud(payload, options = {}) {
    if (!payload || typeof payload !== 'object') return false;
    const bytes = typeof estimateJsonBytes === 'function' ? estimateJsonBytes(payload) : 0;
    if (bytes > MAX_FIRESTORE_PAYLOAD_BYTES) return false;
    if (!cloudSyncUnlocked && !options.forceCloud && (payload.transactions?.length || 0) < 50) return false;
    return true;
}

function readPendingCloudSyncMeta() {
    try {
        const raw = localStorage.getItem(PENDING_CLOUD_SYNC_KEY);
        if (!raw) return null;
        const meta = JSON.parse(raw);
        return meta && typeof meta === 'object' ? meta : { at: Date.now() };
    } catch {
        return { at: Date.now() };
    }
}

function hasPendingCloudSync() {
    return !!localStorage.getItem(PENDING_CLOUD_SYNC_KEY);
}

function markPendingCloudSync(extra = {}) {
    try {
        localStorage.setItem(PENDING_CLOUD_SYNC_KEY, JSON.stringify({
            at: Date.now(),
            attempts: cloudSyncRetryAttempt,
            ...extra
        }));
    } catch (err) {
        console.warn('markPendingCloudSync', err);
    }
    if (typeof setSyncStatus === 'function') {
        const count = typeof getTransactionCount === 'function' ? getTransactionCount(appState) : 0;
        setSyncStatus('pending', count);
    }
}

function clearPendingCloudSync() {
    localStorage.removeItem(PENDING_CLOUD_SYNC_KEY);
    cloudSyncRetryAttempt = 0;
    clearCloudSyncRetryTimer();
}

function clearCloudSyncRetryTimer() {
    if (cloudSyncRetryTimer) {
        clearTimeout(cloudSyncRetryTimer);
        cloudSyncRetryTimer = null;
    }
}

function scheduleCloudSyncRetry() {
    if (cloudSyncRetryTimer) return;
    if (cloudSyncRetryAttempt >= CLOUD_SYNC_MAX_ATTEMPTS) {
        if (typeof setSyncStatus === 'function') {
            const count = typeof getTransactionCount === 'function' ? getTransactionCount(appState) : 0;
            setSyncStatus('offline', count);
        }
        return;
    }
    const delay = Math.min(
        CLOUD_SYNC_BASE_RETRY_MS * (2 ** cloudSyncRetryAttempt),
        CLOUD_SYNC_MAX_RETRY_MS
    );
    cloudSyncRetryAttempt += 1;
    markPendingCloudSync({ nextRetryInMs: delay });
    cloudSyncRetryTimer = setTimeout(() => {
        cloudSyncRetryTimer = null;
        resumePendingCloudSync({ silent: true });
    }, delay);
}

async function flushCloudSync(payload, options = {}) {
    if (!payload || typeof stateRef === 'undefined' || typeof stateRef.set !== 'function') return false;
    if (!canPushPayloadToCloud(payload, options)) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        markPendingCloudSync({ reason: 'offline' });
        scheduleCloudSyncRetry();
        return false;
    }
    try {
        await stateRef.set(payload);
        clearPendingCloudSync();
        if (typeof setSyncStatus === 'function') {
            setSyncStatus('online', payload.transactions?.length || 0);
        }
        return true;
    } catch (err) {
        console.warn('flushCloudSync', err);
        markPendingCloudSync({ reason: 'error' });
        scheduleCloudSyncRetry();
        return false;
    }
}

function runCloudSync(payload, options = {}) {
    if (cloudSyncInFlight) return cloudSyncInFlight;
    cloudSyncInFlight = flushCloudSync(payload, options).finally(() => {
        cloudSyncInFlight = null;
    });
    return cloudSyncInFlight;
}

function queueCloudSync(options = {}) {
    const payload = options.payload || (typeof getPersistedState === 'function' ? getPersistedState(appState) : null);
    if (!canPushPayloadToCloud(payload, options)) return null;
    return runCloudSync(payload, options);
}

async function resumePendingCloudSync(options = {}) {
    if (!hasPendingCloudSync() && !options.force) return false;
    const payload = typeof getPersistedState === 'function' ? getPersistedState(appState) : null;
    if (!payload) return false;
    const ok = await runCloudSync(payload, { forceCloud: options.force === true });
    if (!ok && hasPendingCloudSync() && !cloudSyncRetryTimer) {
        scheduleCloudSyncRetry();
    }
    return ok;
}

async function retryCloudSyncNow(options = {}) {
    clearCloudSyncRetryTimer();
    cloudSyncRetryAttempt = 0;
    if (!options.silent && typeof showAppToast === 'function') {
        showAppToast('Synchronizacja z chmurą…', 'default');
    }
    const ok = await resumePendingCloudSync({ force: true, silent: options.silent === true });
    if (!ok && !options.silent && typeof showAppToast === 'function') {
        showAppToast('Synchronizacja nie powiodła się — spróbuj ponownie później', 'error');
    }
    return ok;
}

function initCloudSyncListeners() {
    if (typeof window === 'undefined' || initCloudSyncListeners._done) return;
    initCloudSyncListeners._done = true;

    window.addEventListener('online', () => {
        cloudSyncRetryAttempt = 0;
        clearCloudSyncRetryTimer();
        resumePendingCloudSync({ silent: true });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && hasPendingCloudSync()) {
            resumePendingCloudSync({ silent: true });
        }
    });

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

    if (hasPendingCloudSync()) {
        resumePendingCloudSync({ silent: true });
    }
}
