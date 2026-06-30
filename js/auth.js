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

function isIosDevice() {
    return /iPad|iPhone|iPod/i.test(navigator.userAgent || '');
}

function isStandaloneDisplay() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
}

function isAuthCallbackUrl() {
    const href = window.location.href;
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    return href.includes('apiKey=')
        || href.includes('oobCode=')
        || href.includes('mode=signIn')
        || search.includes('code=')
        || hash.includes('access_token=')
        || hash.includes('id_token=')
        || href.includes('__/auth/');
}

function formatAuthError(err) {
    if (!err) return 'Logowanie nie powiodło się.';
    const code = err.code || '';
    const map = {
        'auth/unauthorized-domain': 'Ta domena nie jest autoryzowana w Firebase (Authentication → Settings → Authorized domains).',
        'auth/operation-not-allowed': 'Logowanie Google nie jest włączone w Firebase Console (Authentication → Sign-in method).',
        'auth/popup-blocked': 'Przeglądarka zablokowała okno logowania. Otwórz apkę w Safari (nie z ikony PWA) i spróbuj ponownie.',
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

function forceCanonicalIndexUrl() {
    if (isAuthCallbackUrl()) return;
    const base = typeof getBasePath === 'function' ? getBasePath() : '';
    const canonicalPath = base ? `${base}/index.html` : '/index.html';
    const path = window.location.pathname;
    if (path === canonicalPath) return;
    const baseOnly = base || '/';
    const atBase = path === baseOnly || path === `${baseOnly}/`;
    if (!atBase && !path.endsWith('/index.html')) return;
    const next = `${canonicalPath}${window.location.search}${window.location.hash}`;
    window.history.replaceState(null, '', next);
}

async function unregisterServiceWorkerForAuth() {
    if (!('serviceWorker' in navigator)) return;
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.unregister();
    } catch (err) {
        console.warn('unregisterServiceWorkerForAuth', err);
    }
}

function maybeRegisterServiceWorker() {
    if (isIosDevice() && !currentAuthUser) return;
    registerServiceWorker();
}

function iosRedirectFailedMessage() {
    return 'Google Cię zalogowało, ale Safari nie zachowało sesji (znany problem przekierowania na iPhone). '
        + 'Otwórz w Safari adres z /index.html na końcu, zaloguj się tam — po pierwszym logowaniu PWA zwykle już pamięta sesję.';
}

async function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setAuthUiMode('checking');
    forceCanonicalIndexUrl();
    await unregisterServiceWorkerForAuth();

    try {
        await auth.signInWithPopup(provider);
        return;
    } catch (popupErr) {
        console.warn('signInWithPopup', popupErr);
        if (popupErr?.code === 'auth/popup-closed-by-user') {
            setAuthUiMode('signin');
            return;
        }
        const canTryRedirect = popupErr?.code === 'auth/popup-blocked'
            || popupErr?.code === 'auth/cancelled-popup-request';
        if (canTryRedirect && !isIosDevice()) {
            try {
                await auth.signInWithRedirect(provider);
                return;
            } catch (redirectErr) {
                console.error('signInWithRedirect', redirectErr);
                setAuthUiMode('error', formatAuthError(redirectErr));
                return;
            }
        }
        if (isIosDevice()) {
            setAuthUiMode('error', formatAuthError(popupErr) + ' Na iPhone używamy logowania w oknie — nie przekierowania.');
            return;
        }
        setAuthUiMode('error', formatAuthError(popupErr));
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
        cleanAuthCallbackFromUrl();

        if (typeof bootstrapApp === 'function') bootstrapApp();
        refreshAccountSettingsUI();
        if (isIosDevice()) registerServiceWorker();
    } finally {
        authHandlerInFlight = false;
    }
}

function cleanAuthCallbackFromUrl() {
    if (!isAuthCallbackUrl()) return;
    try {
        const base = typeof getBasePath === 'function' ? getBasePath() : '';
        const path = base ? `${base}/index.html` : '/index.html';
        window.history.replaceState(null, '', path);
    } catch (err) {
        console.warn('cleanAuthCallbackFromUrl', err);
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
    forceCanonicalIndexUrl();
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

    const wasAuthCallback = isAuthCallbackUrl();

    try {
        const redirectResult = await auth.getRedirectResult();
        if (redirectResult?.user) {
            await handleAuthenticatedUser(redirectResult.user);
        } else if (redirectResult?.credential && auth.currentUser) {
            await handleAuthenticatedUser(auth.currentUser);
        } else if (wasAuthCallback && !auth.currentUser) {
            setAuthUiMode('error', iosRedirectFailedMessage());
        }
    } catch (err) {
        console.error('getRedirectResult', err);
        setAuthUiMode('error', wasAuthCallback ? iosRedirectFailedMessage() : formatAuthError(err));
    }

    authInitComplete = true;

    if (!currentAuthUser && auth.currentUser) {
        await handleAuthenticatedUser(auth.currentUser);
    } else if (!currentAuthUser && authUiMode !== 'error') {
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
    maybeRegisterServiceWorker();
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
