const firebaseConfig = {
    apiKey: "AIzaSyAfvk2_lfsaf5QZkH_MVk-kWbG8GFvjSeI",
    authDomain: "portfel-pwa.firebaseapp.com",
    projectId: "portfel-pwa",
    storageBucket: "portfel-pwa.firebasestorage.app",
    messagingSenderId: "370658952228",
    appId: "1:370658952228:web:b5fedfe155ea1918e584b1",
    measurementId: "G-MF61T2VZ2K"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

if (typeof db.enablePersistence === 'function') {
    db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
        if (err?.code === 'failed-precondition') {
            console.warn('Firestore persistence: wiele kart — tylko jedna ma cache offline');
        } else if (err?.code === 'unimplemented') {
            console.warn('Firestore persistence niedostępne w tej przeglądarce');
        } else {
            console.warn('Firestore persistence', err);
        }
    });
}

let stateRef = null;
let cloudBackupRef = null;
let cloudBackupSnapshotsRef = null;
let legacyCloudBackupMigrated = false;
let configuredFirestoreUid = null;

function configureFirestoreRefs(uid) {
    if (!uid) {
        stateRef = null;
        cloudBackupRef = null;
        cloudBackupSnapshotsRef = null;
        configuredFirestoreUid = null;
        legacyCloudBackupMigrated = false;
        return;
    }
    if (configuredFirestoreUid === uid && stateRef) return;
    configuredFirestoreUid = uid;
    legacyCloudBackupMigrated = false;
    const userRef = db.collection('users').doc(uid);
    stateRef = userRef.collection('state').doc('main');
    cloudBackupRef = userRef.collection('meta').doc('cloud_backup');
    cloudBackupSnapshotsRef = userRef.collection('snapshots');
}

function getCloudBackupSnapshotSource(data) {
    return data?.backupSource === 'auto' ? 'auto' : 'manual';
}

function cloudBackupSnapshotMeta(data, id) {
    return {
        id,
        exportedAt: data?.exportedAt || null,
        transactionCount: data?.transactionCount || data?.data?.transactions?.length || 0,
        backupSource: getCloudBackupSnapshotSource(data)
    };
}

function sortCloudBackupSnapshots(items) {
    return items.slice().sort((a, b) => {
        const ta = new Date(a.exportedAt || 0).getTime();
        const tb = new Date(b.exportedAt || 0).getTime();
        return tb - ta;
    });
}

function normalizeCloudBackupSnapshotData(data, options = {}) {
    if (!data || typeof data !== 'object') return null;
    const backupSource = options.source || (data.backupSource === 'auto' ? 'auto' : 'manual');
    return {
        ...data,
        exportedAt: data.exportedAt || data.data?.exportedAt || new Date().toISOString(),
        backupSource
    };
}

async function fetchCloudBackupSnapshotDocs() {
    if (!cloudBackupSnapshotsRef) return [];
    const byId = new Map();
    const ingest = (doc) => {
        if (!byId.has(doc.id)) byId.set(doc.id, doc);
    };

    try {
        const ordered = await cloudBackupSnapshotsRef.orderBy('exportedAt', 'desc').get();
        ordered.docs.forEach(ingest);
    } catch (err) {
        console.warn('fetchCloudBackupSnapshotDocs orderBy', err);
    }

    try {
        const all = await cloudBackupSnapshotsRef.get();
        all.docs.forEach(ingest);
    } catch (err) {
        console.warn('fetchCloudBackupSnapshotDocs get', err);
    }

    return [...byId.values()];
}

async function ensureLegacyCloudBackupMigrated() {
    if (legacyCloudBackupMigrated || !cloudBackupSnapshotsRef || !cloudBackupRef) return;
    legacyCloudBackupMigrated = true;
    try {
        const existing = await cloudBackupSnapshotsRef.limit(1).get();
        if (!existing.empty) return;
        const legacy = await cloudBackupRef.get();
        if (!legacy.exists) return;
        const data = legacy.data();
        const normalized = normalizeCloudBackupSnapshotData(data);
        if (!normalized || (!normalized.exportedAt && !normalized.data?.transactions?.length)) return;
        await cloudBackupSnapshotsRef.add(normalized);
    } catch (err) {
        console.warn('ensureLegacyCloudBackupMigrated', err);
        legacyCloudBackupMigrated = false;
    }
}

async function pruneCloudBackupSnapshots() {
    if (!cloudBackupSnapshotsRef) return;
    try {
        const docs = await fetchCloudBackupSnapshotDocs();
        const autoDocs = [];
        const manualDocs = [];
        docs.forEach((doc) => {
            const source = getCloudBackupSnapshotSource(doc.data());
            if (source === 'auto') autoDocs.push(doc);
            else manualDocs.push(doc);
        });
        autoDocs.sort((a, b) => {
            const ta = new Date(a.data()?.exportedAt || 0).getTime();
            const tb = new Date(b.data()?.exportedAt || 0).getTime();
            return tb - ta;
        });
        manualDocs.sort((a, b) => {
            const ta = new Date(a.data()?.exportedAt || 0).getTime();
            const tb = new Date(b.data()?.exportedAt || 0).getTime();
            return tb - ta;
        });
        const excess = [
            ...autoDocs.slice(MAX_CLOUD_BACKUP_SNAPSHOTS_AUTO),
            ...manualDocs.slice(MAX_CLOUD_BACKUP_SNAPSHOTS_MANUAL)
        ];
        if (!excess.length) return;
        const batch = db.batch();
        excess.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
    } catch (err) {
        console.warn('pruneCloudBackupSnapshots', err);
    }
}

function prepareCloudBackupSnapshotPayload(payload, options = {}) {
    const backupSource = options.source === 'auto' ? 'auto' : 'manual';
    const raw = {
        ...payload,
        exportedAt: payload.exportedAt || new Date().toISOString(),
        backupSource
    };
    const sanitized = typeof sanitizeFirestorePayload === 'function'
        ? sanitizeFirestorePayload(raw)
        : raw;
    const bytes = typeof estimateJsonBytes === 'function'
        ? estimateJsonBytes(sanitized)
        : JSON.stringify(sanitized).length;
    if (bytes > MAX_CLOUD_BACKUP_BYTES) {
        const kb = Math.round(bytes / 1024);
        const maxKb = Math.round(MAX_CLOUD_BACKUP_BYTES / 1024);
        throw new Error(`Kopia jest za duża dla chmury (${kb} KB, max ${maxKb} KB). Użyj „Kopia na telefon”.`);
    }
    return sanitized;
}

async function saveCloudBackupSnapshot(payload, options = {}) {
    if (!cloudBackupSnapshotsRef || !cloudBackupRef) {
        throw new Error('Chmura niedostępna — zaloguj się ponownie');
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('Brak internetu — połącz się z siecią i spróbuj ponownie.');
    }
    await ensureLegacyCloudBackupMigrated();
    const snapshotPayload = prepareCloudBackupSnapshotPayload(payload, options);
    await withFirestoreTimeout(cloudBackupSnapshotsRef.add(snapshotPayload), 45000);
    await withFirestoreTimeout(cloudBackupRef.set(snapshotPayload), 45000);
    await pruneCloudBackupSnapshots();
}

async function listCloudBackupSnapshots() {
    if (!cloudBackupSnapshotsRef || !cloudBackupRef) return [];
    await ensureLegacyCloudBackupMigrated();
    const byId = new Map();

    try {
        const docs = await fetchCloudBackupSnapshotDocs();
        docs.forEach((doc) => {
            byId.set(doc.id, cloudBackupSnapshotMeta(doc.data(), doc.id));
        });
    } catch (err) {
        console.warn('listCloudBackupSnapshots', err);
    }

    if (!byId.size) {
        try {
            const legacy = await cloudBackupRef.get();
            if (legacy.exists) {
                const data = legacy.data();
                if (data?.exportedAt || data?.data?.transactions?.length) {
                    byId.set('cloud_backup', cloudBackupSnapshotMeta(data, 'cloud_backup'));
                }
            }
        } catch (err) {
            console.warn('listCloudBackupSnapshots legacy', err);
        }
    }

    return sortCloudBackupSnapshots([...byId.values()]);
}

async function getCloudBackupSnapshotById(id) {
    if (!id || !cloudBackupSnapshotsRef || !cloudBackupRef) return null;
    if (id === 'cloud_backup') {
        try {
            const snap = await cloudBackupRef.get();
            if (snap.exists) return { id, ...snap.data() };
        } catch (err) {
            console.warn('getCloudBackupSnapshotById legacy', err);
        }
        return null;
    }

    try {
        const snap = await cloudBackupSnapshotsRef.doc(id).get();
        if (snap.exists) return { id: snap.id, ...snap.data() };
    } catch (err) {
        console.warn('getCloudBackupSnapshotById', err);
    }
    return null;
}

async function getCloudBackupPayload() {
    const snapshots = await listCloudBackupSnapshots();
    if (snapshots.length) {
        const latest = await getCloudBackupSnapshotById(snapshots[0].id);
        if (latest) return latest;
    }

    if (!cloudBackupRef) return null;
    const sdkSources = ['server', 'default'];
    for (const source of sdkSources) {
        try {
            const snap = await cloudBackupRef.get({ source });
            if (snap.exists) return snap.data();
        } catch (err) {
            console.warn(`getCloudBackupPayload SDK (${source})`, err);
        }
    }
    return null;
}

function withFirestoreTimeout(promise, ms = 8000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('Firestore timeout')), ms);
        })
    ]);
}

function legacyMigrationStorageKey(uid) {
    return `legacy_finances_migrated_${uid}`;
}

function legacyCloudBackupsMigrationStorageKey(uid) {
    return `legacy_cloud_backups_migrated_${uid}`;
}

async function migrateLegacyCloudBackupsIfNeeded(uid) {
    if (!uid || !cloudBackupSnapshotsRef || !cloudBackupRef) return;
    if (typeof isDemoFinanceUid === 'function' && isDemoFinanceUid(uid)) {
        localStorage.setItem(legacyCloudBackupsMigrationStorageKey(uid), '1');
        return;
    }
    if (localStorage.getItem(legacyCloudBackupsMigrationStorageKey(uid)) === '1') return;

    try {
        const existing = await cloudBackupSnapshotsRef.limit(1).get();
        if (!existing.empty) {
            localStorage.setItem(legacyCloudBackupsMigrationStorageKey(uid), '1');
            return;
        }
    } catch (err) {
        console.warn('migrateLegacyCloudBackupsIfNeeded check', err);
    }

    await ensureLegacyCloudBackupMigrated();

    try {
        const afterMeta = await cloudBackupSnapshotsRef.limit(1).get();
        if (!afterMeta.empty) {
            localStorage.setItem(legacyCloudBackupsMigrationStorageKey(uid), '1');
            return;
        }
    } catch (err) {
        console.warn('migrateLegacyCloudBackupsIfNeeded after meta', err);
    }

    let migratedCount = 0;

    try {
        const legacySnaps = await db.collection('finances').doc('backups').collection('snapshots').get();
        for (const doc of legacySnaps.docs) {
            const normalized = normalizeCloudBackupSnapshotData(doc.data());
            if (!normalized) continue;
            await cloudBackupSnapshotsRef.doc(doc.id).set(normalized);
            migratedCount += 1;
        }
        if (migratedCount) {
            console.info(`Migracja kopii: przeniesiono ${migratedCount} snapshotów z finances/backups`);
        }
    } catch (err) {
        console.warn('migrateLegacyCloudBackupsIfNeeded snapshots', err);
    }

    try {
        const legacyBackup = await db.collection('finances').doc('cloud_backup').get();
        if (legacyBackup.exists) {
            const normalized = normalizeCloudBackupSnapshotData(legacyBackup.data());
            if (normalized) {
                await cloudBackupRef.set(normalized);
                if (!migratedCount) {
                    await cloudBackupSnapshotsRef.add(normalized);
                }
                migratedCount += 1;
                console.info('Migracja kopii: przeniesiono finances/cloud_backup');
            }
        }
    } catch (err) {
        console.warn('migrateLegacyCloudBackupsIfNeeded cloud_backup', err);
    }

    localStorage.setItem(legacyCloudBackupsMigrationStorageKey(uid), '1');
}

async function migrateLegacyUserDataIfNeeded(uid) {
    if (!uid || !stateRef) return;
    await migrateLegacyCloudBackupsIfNeeded(uid);
    if (typeof isDemoFinanceUid === 'function' && isDemoFinanceUid(uid)) {
        localStorage.setItem(legacyMigrationStorageKey(uid), '1');
        return;
    }
    if (localStorage.getItem(legacyMigrationStorageKey(uid)) === '1') return;

    try {
        const userStateSnap = await stateRef.get();
        if (userStateSnap.exists) {
            const data = userStateSnap.data();
            if (data?.transactions?.length || data?.loans?.length || data?.assets?.length) {
                localStorage.setItem(legacyMigrationStorageKey(uid), '1');
                return;
            }
        }
    } catch (err) {
        console.warn('migrateLegacyUserDataIfNeeded check', err);
    }

    const legacyStateRef = db.collection('finances').doc('my_state');
    try {
        const legacySnap = await legacyStateRef.get();
        if (legacySnap.exists) {
            const data = legacySnap.data();
            if (data && (data.transactions?.length || data.loans?.length || data.assets?.length)) {
                await stateRef.set(data);
                console.info('Migracja: przeniesiono stan z finances/my_state');
            }
        }
    } catch (err) {
        console.warn('migrateLegacyUserDataIfNeeded state', err);
    }

    localStorage.setItem(legacyMigrationStorageKey(uid), '1');
}
