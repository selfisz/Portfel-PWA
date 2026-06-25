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
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${encodeURIComponent(collectionId)}/${encodeURIComponent(documentId)}?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    if (doc.error) throw new Error(doc.error.message || 'Firestore REST');
    return decodeFirestoreDocument(doc);
}

async function getCloudBackupPayload() {
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
