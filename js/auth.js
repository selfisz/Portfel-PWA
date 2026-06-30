const ALLOWED_AUTH_EMAILS = ['dawidrekal@gmail.com'];

let authReady = false;
let currentAuthUser = null;
let authUiMode = 'checking';

function normalizeAuthEmail(email) {
    return (email || '').trim().toLowerCase();
}

function isEmailAllowed(email) {
    const normalized = normalizeAuthEmail(email);
    return ALLOWED_AUTH_EMAILS.some((allowed) => normalizeAuthEmail(allowed) === normalized);
}

function isUserSignedIn() {
    return !!currentAuthUser;
}

function getCurrentAuthUser() {
    return currentAuthUser;
}

function setAuthUiMode(mode, message) {
    authUiMode = mode;
    const overlay = document.getElementById('auth-overlay');
    const titleEl = document.getElementById('auth-title');
    const messageEl = document.getElementById('auth-message');
    const errorEl = document.getElementById('auth-error');
    const checkingEl = document.getElementById('auth-checking');
    const signInBtn = document.getElementById('btn-google-signin');

    if (!overlay) return;

    overlay.classList.remove('hidden');
    document.body.classList.add('auth-locked');

    const isChecking = mode === 'checking';
    const isDenied = mode === 'denied';
    const isError = mode === 'error';

    if (titleEl) {
        titleEl.textContent = isDenied ? 'Brak dostępu' : 'Finanse';
    }
    if (messageEl) {
        if (mode === 'signin') {
            messageEl.textContent = 'Zaloguj się kontem Google, aby korzystać z aplikacji.';
        } else if (isDenied) {
            messageEl.textContent = 'To konto nie ma uprawnień. Dostęp przyznaje administrator.';
        } else if (isChecking) {
            messageEl.textContent = 'Sprawdzanie sesji…';
        } else {
            messageEl.textContent = message || 'Zaloguj się, aby kontynuować.';
        }
    }
    if (checkingEl) checkingEl.classList.toggle('hidden', !isChecking);
    if (signInBtn) signInBtn.classList.toggle('hidden', isChecking);
    if (errorEl) {
        const errText = isError ? (message || 'Logowanie nie powiodło się.') : '';
        errorEl.textContent = errText;
        errorEl.classList.toggle('hidden', !errText);
    }
}

function hideAuthOverlay() {
    document.getElementById('auth-overlay')?.classList.add('hidden');
    document.body.classList.remove('auth-locked');
}

async function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setAuthUiMode('checking');
    try {
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
        if (isStandalone) {
            await auth.signInWithRedirect(provider);
            return;
        }
        await auth.signInWithPopup(provider);
    } catch (err) {
        console.error('signInWithGoogle', err);
        if (err?.code === 'auth/popup-closed-by-user') {
            setAuthUiMode('signin');
            return;
        }
        setAuthUiMode('error', err?.message || 'Nie udało się zalogować przez Google.');
    }
}

async function signOutFromApp() {
    try {
        if (typeof stopCloudSync === 'function') stopCloudSync();
        await auth.signOut();
        window.location.reload();
    } catch (err) {
        console.error('signOutFromApp', err);
        if (typeof showAppToast === 'function') {
            showAppToast('Wylogowanie nie powiodło się', 'error');
        }
    }
}

function refreshAccountSettingsUI() {
    const emailEl = document.getElementById('settings-account-email');
    if (!emailEl) return;
    emailEl.textContent = currentAuthUser?.email || '—';
}

async function handleAuthenticatedUser(user) {
    if (!isEmailAllowed(user.email)) {
        currentAuthUser = null;
        authReady = true;
        try {
            await auth.signOut();
        } catch (err) {
            console.warn('signOut denied user', err);
        }
        setAuthUiMode('denied');
        return;
    }

    currentAuthUser = user;
    authReady = true;

    if (typeof setFinanceStorageKey === 'function') setFinanceStorageKey(user.uid);
    migrateLocalStorageToUidKey(user.uid);
    configureFirestoreRefs(user.uid);
    await migrateLegacyUserDataIfNeeded(user.uid);

    if (typeof cloudSyncUnlocked !== 'undefined') cloudSyncUnlocked = true;

    hideAuthOverlay();

    if (typeof bootstrapApp === 'function') bootstrapApp();
    refreshAccountSettingsUI();
}

function handleSignedOutUser() {
    currentAuthUser = null;
    authReady = true;
    configureFirestoreRefs(null);
    if (typeof stopCloudSync === 'function') stopCloudSync();
    if (typeof bootstrapApp !== 'undefined' && bootstrapApp._done) {
        bootstrapApp._done = false;
    }
    setAuthUiMode('signin');
}

function migrateLocalStorageToUidKey(uid) {
    if (!uid) return;
    const uidKey = `${STORAGE_KEY}_${uid}`;
    if (localStorage.getItem(uidKey)) return;
    const legacy = localStorage.getItem(STORAGE_KEY);
    if (legacy) {
        try {
            localStorage.setItem(uidKey, legacy);
        } catch (err) {
            console.warn('migrateLocalStorageToUidKey', err);
        }
    }
}

function initAuthGate() {
    document.body.classList.add('auth-locked');
    setAuthUiMode('checking');

    const signInBtn = document.getElementById('btn-google-signin');
    if (signInBtn && !signInBtn.dataset.bound) {
        signInBtn.dataset.bound = '1';
        signInBtn.addEventListener('click', () => signInWithGoogle());
    }

    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((err) => {
        console.warn('auth persistence', err);
    });

    auth.getRedirectResult().catch((err) => {
        console.error('getRedirectResult', err);
        setAuthUiMode('error', err?.message || 'Logowanie przekierowania nie powiodło się.');
    });

    auth.onAuthStateChanged((user) => {
        if (user) {
            handleAuthenticatedUser(user).catch((err) => {
                console.error('handleAuthenticatedUser', err);
                setAuthUiMode('error', 'Nie udało się przygotować sesji.');
            });
        } else {
            handleSignedOutUser();
        }
    });

    initTheme();
    registerServiceWorker();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthGate);
} else {
    initAuthGate();
}
