import { collection, doc } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ALLOWED_AUTH_EMAIL, auth, db } from './firebase-config.mjs';

export function userStateRef(uid) {
    return doc(db, 'users', uid, 'state', 'main');
}

export function userCloudBackupRef(uid) {
    return doc(db, 'users', uid, 'meta', 'cloud_backup');
}

export function userSnapshotsCollection(uid) {
    return collection(db, 'users', uid, 'snapshots');
}

export async function signInForScripts() {
    const email = process.env.FIREBASE_AUTH_EMAIL || ALLOWED_AUTH_EMAIL;
    const password = process.env.FIREBASE_AUTH_PASSWORD;
    if (!password) {
        throw new Error('Ustaw zmienną środowiskową FIREBASE_AUTH_PASSWORD (hasło konta Firebase).');
    }
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    if (user.email !== ALLOWED_AUTH_EMAIL) {
        throw new Error(`Konto ${user.email} nie jest na liście dozwolonych.`);
    }
    return user.uid;
}
