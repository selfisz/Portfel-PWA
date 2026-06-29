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
const stateRef = db.collection('finances').doc('my_state');
const cloudBackupRef = db.collection('finances').doc('cloud_backup');
const cloudBackupVaultRef = db.collection('finances').doc('backups');
const cloudBackupSnapshotsRef = cloudBackupVaultRef.collection('snapshots');
let legacyCloudBackupMigrated = false;

// Persistence wyłączone — na iOS PWA powodowało zawieszanie onSnapshot
// i serwowanie pustego/starego cache zamiast danych z serwera.

function decodeFirestoreValue(field) {
    if (!field || typeof field !== 'object') return field;
    if ('stringValue' in field) return field.stringValue;
    if ('integerValue' in field) return Number(field.integerValue);
    if ('doubleValue' in field) return field.doubleValue;
    if ('booleanValue' in field) return field.booleanValue;
    if ('nullValue' in field) return null;
    if ('timestampValue' in field) return field.timestampValue;
    if ('arrayValue' in field) {
        const values = field.arrayValue.values;
        return values ? values.map(decodeFirestoreValue) : [];
    }
    if ('mapValue' in field) {
        const out = {};
        const nested = field.mapValue.fields || {};
        Object.keys(nested).forEach((key) => {
            out[key] = decodeFirestoreValue(nested[key]);
        });
        return out;
    }
    return null;
}

function decodeFirestoreDocument(doc) {
    if (!doc?.fields) return null;
    const out = {};
    Object.keys(doc.fields).forEach((key) => {
        out[key] = decodeFirestoreValue(doc.fields[key]);
    });
    return out;
}

async function fetchFirestoreDocumentRest(collectionId, documentId) {
    return fetchFirestoreDocumentPathRest(`${encodeURIComponent(collectionId)}/${encodeURIComponent(documentId)}`);
}

async function fetchFirestoreDocumentPathRest(documentPath) {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${documentPath}?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    if (doc.error) throw new Error(doc.error.message || 'Firestore REST');
    return decodeFirestoreDocument(doc);
}

async function fetchFirestoreCollectionRest(collectionPath) {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${collectionPath}?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(body.error.message || 'Firestore REST');
    const docs = body.documents || [];
    return docs.map((doc) => {
        const id = doc.name.split('/').pop();
        return { id, ...decodeFirestoreDocument(doc) };
    });
}

function cloudBackupSnapshotMeta(data, id) {
    return {
        id,
        exportedAt: data?.exportedAt || null,
        transactionCount: data?.transactionCount || data?.data?.transactions?.length || 0
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
    if (legacyCloudBackupMigrated) return;
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
    try {
        const snap = await cloudBackupSnapshotsRef.orderBy('exportedAt', 'desc').get();
        const excess = snap.docs.slice(MAX_CLOUD_BACKUP_SNAPSHOTS);
        if (!excess.length) return;
        const batch = db.batch();
        excess.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
    } catch (err) {
        console.warn('pruneCloudBackupSnapshots', err);
    }
}

async function saveCloudBackupSnapshot(payload) {
    await ensureLegacyCloudBackupMigrated();
    const snapshotPayload = {
        ...payload,
        exportedAt: payload.exportedAt || new Date().toISOString()
    };
    await cloudBackupSnapshotsRef.add(snapshotPayload);
    await cloudBackupRef.set(snapshotPayload);
    await pruneCloudBackupSnapshots();
}

async function listCloudBackupSnapshots() {
    await ensureLegacyCloudBackupMigrated();
    const byId = new Map();

    try {
        const snap = await cloudBackupSnapshotsRef.orderBy('exportedAt', 'desc').get();
        snap.docs.forEach((doc) => {
            byId.set(doc.id, cloudBackupSnapshotMeta(doc.data(), doc.id));
        });
    } catch (err) {
        console.warn('listCloudBackupSnapshots SDK', err);
    }

    if (!byId.size) {
        try {
            const restDocs = await fetchFirestoreCollectionRest('finances/backups/snapshots');
            restDocs.forEach((doc) => {
                byId.set(doc.id, cloudBackupSnapshotMeta(doc, doc.id));
            });
        } catch (err) {
            console.warn('listCloudBackupSnapshots REST', err);
        }
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
    if (!id) return null;
    if (id === 'cloud_backup') {
        try {
            const snap = await cloudBackupRef.get();
            if (snap.exists) return { id, ...snap.data() };
        } catch (err) {
            console.warn('getCloudBackupSnapshotById legacy', err);
        }
        try {
            const data = await fetchFirestoreDocumentRest('finances', 'cloud_backup');
            if (data) return { id, ...data };
        } catch (err) {
            console.warn('getCloudBackupSnapshotById legacy REST', err);
        }
        return null;
    }

    try {
        const snap = await cloudBackupSnapshotsRef.doc(id).get();
        if (snap.exists) return { id: snap.id, ...snap.data() };
    } catch (err) {
        console.warn('getCloudBackupSnapshotById SDK', err);
    }

    try {
        const data = await fetchFirestoreDocumentPathRest(`finances/backups/snapshots/${encodeURIComponent(id)}`);
        if (data) return { id, ...data };
    } catch (err) {
        console.warn('getCloudBackupSnapshotById REST', err);
    }
    return null;
}

async function getCloudBackupPayload() {
    const snapshots = await listCloudBackupSnapshots();
    if (snapshots.length) {
        const latest = await getCloudBackupSnapshotById(snapshots[0].id);
        if (latest) return latest;
    }

    const sdkSources = ['server', 'default'];
    for (const source of sdkSources) {
        try {
            const snap = await cloudBackupRef.get({ source });
            if (snap.exists) return snap.data();
        } catch (err) {
            console.warn(`getCloudBackupPayload SDK (${source})`, err);
        }
    }
    try {
        return await fetchFirestoreDocumentRest('finances', 'cloud_backup');
    } catch (err) {
        console.warn('getCloudBackupPayload REST cloud_backup', err);
    }
    try {
        const state = await fetchFirestoreDocumentRest('finances', 'my_state');
        if (state && Array.isArray(state.transactions)) {
            return {
                version: 1,
                exportedAt: new Date().toISOString(),
                transactionCount: state.transactions.length,
                data: state
            };
        }
    } catch (err) {
        console.warn('getCloudBackupPayload REST my_state', err);
    }
    return null;
}

async function fetchAppStateRest() {
    return fetchFirestoreDocumentRest('finances', 'my_state');
}

function withFirestoreTimeout(promise, ms = 8000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('Firestore timeout')), ms);
        })
    ]);
}
