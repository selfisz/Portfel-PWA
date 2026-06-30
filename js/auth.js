const ALLOWED_AUTH_EMAILS = ['dawidrekal@gmail.com'];

let authReady = false;
let currentAuthUser = null;
let authUiMode = 'checking';
let authInitComplete = false;
let authDenyLock = false;
let authHandlerInFlight = false;

function normalizeAuthEmail(email) {
    return (email || '').trim().toLowerCase();
}

function getUserAuthEmail(user) {
    if (!user) return '';
    if (user.email) return user.email;
    const googleProvider = (user.providerData || []).find((p) => p.providerId === 'google.com');
    return googleProvider?.email || user.providerData?.[0]?.email || '';
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

function formatAuthError(err) {
    if (!err) return 'Logowanie nie powiodło się.';
    const code = err.code || '';
    const map = {
        'auth/unauthorized-domain': 'Ta domena nie jest autoryzowana w Firebase (Authentication → Settings → Authorized domains).',
        'auth/operation-not-allowed': 'Logowanie Google nie jest włączone w Firebase Console (Authentication → Sign-in method).',
        'auth/popup-blocked': 'Przeglądarka zablokowała okno logowania — spróbuj ponownie lub otwórz apkę w Safari/Chrome.',
        'auth/network-request-failed': 'Brak połączenia z internetem podczas logowania.',
        'auth/web-storage-unsupported': 'Przeglądarka blokuje pamięć sesji — wyłącz tryb prywatny lub zezwól na ciasteczka.'
    };
    if (map[code]) return map[code];
    return err.message || 'Logowanie nie powiodło się.';
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
            messageEl.textContent = message || 'To konto nie ma uprawnień. Dostęp przyznaje administrator.';
        } else if (isChecking) {
            messageEl.textContent = 'Sprawdzanie sesji…';
        } else {
            messageEl.textContent = message || 'Zaloguj się, aby kontynuować.';
        }
    }
    if (checkingEl) checkingEl.classList.toggle('hidden', !isChecking);
    if (signInBtn) signInBtn.classList.toggle('hidden', isChecking || isDenied);
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

function shouldUseRedirectSignIn() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
    return isStandalone || isMobile;
}

async function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setAuthUiMode('checking');
    try {
        if (shouldUseRedirectSignIn()) {
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
        if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/cancelled-popup-request') {
            try {
                await auth.signInWithRedirect(provider);
                return;
            } catch (redirectErr) {
                console.error('signInWithRedirect fallback', redirectErr);
                setAuthUiMode('error', formatAuthError(redirectErr));
                return;
            }
        }
        setAuthUiMode('error', formatAuthError(err));
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
    emailEl.textContent = getUserAuthEmail(currentAuthUser) || '—';
}

async function handleAuthenticatedUser(user) {
    if (!user || authHandlerInFlight) return;
    authHandlerInFlight = true;
    try {
        const email = getUserAuthEmail(user);
        if (!isEmailAllowed(email)) {
            currentAuthUser = null;
            authReady = true;
            authDenyLock = true;
            try {
                await auth.signOut();
            } catch (err) {
                console.warn('signOut denied user', err);
            }
            setAuthUiMode('denied', `Zalogowano jako ${email || 'nieznany e-mail'}, ale to konto nie ma dostępu. Użyj: ${ALLOWED_AUTH_EMAILS[0]}.`);
            return;
        }

        currentAuthUser = user;
        authReady = true;
        authDenyLock = false;

        if (typeof setFinanceStorageKey === 'function') setFinanceStorageKey(user.uid);
        migrateLocalStorageToUidKey(user.uid);
        configureFirestoreRefs(user.uid);

        try {
            await migrateLegacyUserDataIfNeeded(user.uid);
        } catch (err) {
            console.warn('migrateLegacyUserDataIfNeeded', err);
        }

        if (typeof cloudSyncUnlocked !== 'undefined') cloudSyncUnlocked = true;

        hideAuthOverlay();

        if (typeof bootstrapApp === 'function') bootstrapApp();
        refreshAccountSettingsUI();
    } finally {
        authHandlerInFlight = false;
    }
}

function handleSignedOutUser() {
    if (!authInitComplete || authDenyLock || authUiMode === 'denied') return;
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

async function initAuthGate() {
    document.body.classList.add('auth-locked');
    setAuthUiMode('checking');

    const signInBtn = document.getElementById('btn-google-signin');
    if (signInBtn && !signInBtn.dataset.bound) {
        signInBtn.dataset.bound = '1';
        signInBtn.addEventListener('click', () => signInWithGoogle());
    }

    try {
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (err) {
        console.warn('auth persistence LOCAL failed, trying SESSION', err);
        try {
            await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
        } catch (sessionErr) {
            console.warn('auth persistence SESSION failed', sessionErr);
        }
    }

    try {
        const redirectResult = await auth.getRedirectResult();
        if (redirectResult?.user) {
            await handleAuthenticatedUser(redirectResult.user);
        } else if (redirectResult?.credential) {
            const liveUser = auth.currentUser;
            if (liveUser) await handleAuthenticatedUser(liveUser);
        }
    } catch (err) {
        console.error('getRedirectResult', err);
        setAuthUiMode('error', formatAuthError(err));
    }

    authInitComplete = true;

    if (!currentAuthUser && auth.currentUser) {
        await handleAuthenticatedUser(auth.currentUser);
    } else if (!currentAuthUser) {
        setAuthUiMode('signin');
    }

    auth.onAuthStateChanged((user) => {
        if (user) {
            handleAuthenticatedUser(user).catch((err) => {
                console.error('handleAuthenticatedUser', err);
                setAuthUiMode('error', formatAuthError(err));
            });
        } else {
            handleSignedOutUser();
        }
    });

    initTheme();
    registerServiceWorker();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initAuthGate().catch((err) => {
            console.error('initAuthGate', err);
            setAuthUiMode('error', formatAuthError(err));
        });
    });
} else {
    initAuthGate().catch((err) => {
        console.error('initAuthGate', err);
        setAuthUiMode('error', formatAuthError(err));
    });
}
