let cloudSyncInFlight = null;
let cloudSyncRetryTimer = null;
let cloudSyncRetryAttempt = 0;

function canPushPayloadToCloud(payload, options = {}) {
    if (!payload || typeof payload !== 'object') return false;
    if (typeof isUserSignedIn === 'function' && !isUserSignedIn()) return false;
    const bytes = typeof estimateJsonBytes === 'function' ? estimateJsonBytes(payload) : 0;
    if (bytes > MAX_FIRESTORE_PAYLOAD_BYTES) return false;
    if (!cloudSyncUnlocked && !options.forceCloud && (payload.transactions?.length || 0) < 50) return false;
    return true;
}

function readPendingCloudSyncMeta() {
    try {
        const raw = localStorage.getItem(getPendingCloudSyncStorageKey());
        if (!raw) return null;
        const meta = JSON.parse(raw);
        return meta && typeof meta === 'object' ? meta : { at: Date.now() };
    } catch {
        return { at: Date.now() };
    }
}

function hasPendingCloudSync() {
    return !!localStorage.getItem(getPendingCloudSyncStorageKey());
}

function markPendingCloudSync(extra = {}) {
    try {
        const uid = typeof getCurrentAuthUser === 'function' ? getCurrentAuthUser()?.uid : null;
        localStorage.setItem(getPendingCloudSyncStorageKey(), JSON.stringify({
            at: Date.now(),
            attempts: cloudSyncRetryAttempt,
            uid: uid || null,
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
    localStorage.removeItem(getPendingCloudSyncStorageKey());
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
    if (!canPushPayloadToCloud(payload, options)) {
        if (payload && (
            (typeof isAppOffline === 'function' && isAppOffline())
            || (typeof isUserSignedIn === 'function' && !isUserSignedIn())
        )) {
            markPendingCloudSync({
                reason: typeof isAppOffline === 'function' && isAppOffline() ? 'offline' : 'awaiting-auth'
            });
        }
        return null;
    }
    return runCloudSync(payload, options);
}

async function resumePendingCloudSync(options = {}) {
    if (!hasPendingCloudSync() && !options.force) return false;
    const meta = readPendingCloudSyncMeta();
    const currentUid = typeof getCurrentAuthUser === 'function' ? getCurrentAuthUser()?.uid : null;
    if (meta?.uid && currentUid && meta.uid !== currentUid) {
        clearPendingCloudSync();
        return false;
    }
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

