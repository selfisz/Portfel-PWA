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

async function ensureLegacyCloudBackupMigrated() {
    if (legacyCloudBackupMigrated || !cloudBackupSnapshotsRef || !cloudBackupRef) return;
    legacyCloudBackupMigrated = true;
    try {
        const existing = await cloudBackupSnapshotsRef.limit(1).get();
        if (!existing.empty) return;
        const legacy = await cloudBackupRef.get();
        if (!legacy.exists) return;
        const data = legacy.data();
        if (!data || (!data.exportedAt && !data.data?.transactions?.length)) return;
        await cloudBackupSnapshotsRef.add(data);
    } catch (err) {
        console.warn('ensureLegacyCloudBackupMigrated', err);
        legacyCloudBackupMigrated = false;
    }
}

async function pruneCloudBackupSnapshots() {
    if (!cloudBackupSnapshotsRef) return;
    try {
        const snap = await cloudBackupSnapshotsRef.orderBy('exportedAt', 'desc').get();
        const autoDocs = [];
        const manualDocs = [];
        snap.docs.forEach((doc) => {
            const source = getCloudBackupSnapshotSource(doc.data());
            if (source === 'auto') autoDocs.push(doc);
            else manualDocs.push(doc);
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

async function saveCloudBackupSnapshot(payload, options = {}) {
    if (!cloudBackupSnapshotsRef || !cloudBackupRef) return;
    await ensureLegacyCloudBackupMigrated();
    const backupSource = options.source === 'auto' ? 'auto' : 'manual';
    const snapshotPayload = {
        ...payload,
        exportedAt: payload.exportedAt || new Date().toISOString(),
        backupSource
    };
    await cloudBackupSnapshotsRef.add(snapshotPayload);
    await cloudBackupRef.set(snapshotPayload);
    await pruneCloudBackupSnapshots();
}

async function listCloudBackupSnapshots() {
    if (!cloudBackupSnapshotsRef || !cloudBackupRef) return [];
    await ensureLegacyCloudBackupMigrated();
    const byId = new Map();

    try {
        const snap = await cloudBackupSnapshotsRef.orderBy('exportedAt', 'desc').get();
        snap.docs.forEach((doc) => {
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

async function migrateLegacyUserDataIfNeeded(uid) {
    if (!uid || !stateRef) return;
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

    try {
        const legacySnaps = await db.collection('finances').doc('backups').collection('snapshots').get();
        for (const doc of legacySnaps.docs) {
            await cloudBackupSnapshotsRef.doc(doc.id).set(doc.data());
        }
        if (!legacySnaps.empty) {
            console.info(`Migracja: przeniesiono ${legacySnaps.size} kopii zapasowych`);
        }
    } catch (err) {
        console.warn('migrateLegacyUserDataIfNeeded snapshots', err);
    }

    try {
        const legacyBackup = await db.collection('finances').doc('cloud_backup').get();
        if (legacyBackup.exists) {
            await cloudBackupRef.set(legacyBackup.data());
        }
    } catch (err) {
        console.warn('migrateLegacyUserDataIfNeeded cloud_backup', err);
    }

    localStorage.setItem(legacyMigrationStorageKey(uid), '1');
}
