import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import {
    DEMO_ACCOUNT_EMAIL,
    DEMO_ACCOUNT_PASSWORD,
    isAllowedAuthEmail
} from './auth-allowed.mjs';
import { auth } from './firebase-config.mjs';

export async function ensureDemoAuthUser(email = DEMO_ACCOUNT_EMAIL, password = DEMO_ACCOUNT_PASSWORD) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!isAllowedAuthEmail(normalized)) {
        throw new Error(`E-mail ${normalized} nie jest na liście dozwolonych kont.`);
    }

    try {
        const { user } = await createUserWithEmailAndPassword(auth, normalized, password);
        console.log(`Utworzono konto Firebase: ${normalized} (uid: ${user.uid})`);
        return user;
    } catch (err) {
        if (err?.code === 'auth/email-already-in-use') {
            const { user } = await signInWithEmailAndPassword(auth, normalized, password);
            console.log(`Konto już istnieje — zalogowano: ${normalized} (uid: ${user.uid})`);
            return user;
        }
        if (err?.code === 'auth/weak-password') {
            throw new Error('Hasło za słabe — Firebase wymaga min. 6 znaków (używamy test12).');
        }
        throw err;
    }
}
