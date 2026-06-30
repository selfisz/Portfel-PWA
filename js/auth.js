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

function usesEmailPasswordAuth() {
    return isIosDevice();
}

function isIosDevice() {
    return /iPad|iPhone|iPod/i.test(navigator.userAgent || '');
}

function formatAuthError(err) {
    if (!err) return 'Logowanie nie powiodło się.';
    const code = err.code || '';
    const map = {
        'auth/unauthorized-domain': 'Ta domena nie jest autoryzowana w Firebase.',
        'auth/operation-not-allowed': 'Ta metoda logowania nie jest włączona w Firebase Console.',
        'auth/popup-blocked': 'Przeglądarka zablokowała okno logowania. Spróbuj ponownie.',
        'auth/network-request-failed': 'Brak połączenia z internetem podczas logowania.',
        'auth/web-storage-unsupported': 'Przeglądarka blokuje pamięć sesji.',
        'auth/invalid-email': 'Nieprawidłowy adres e-mail.',
        'auth/user-disabled': 'To konto zostało wyłączone.',
        'auth/user-not-found': 'Nieprawidłowy e-mail lub hasło.',
        'auth/wrong-password': 'Nieprawidłowy e-mail lub hasło.',
        'auth/invalid-credential': 'Nieprawidłowy e-mail lub hasło.',
        'auth/too-many-requests': 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.'
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
    const emailForm = document.getElementById('auth-email-form');

    if (!overlay) return;

    overlay.classList.remove('hidden');
    document.body.classList.add('auth-locked');

    const isChecking = mode === 'checking';
    const isDenied = mode === 'denied';
    const isError = mode === 'error';
    const isSignin = mode === 'signin';

    if (titleEl) {
        titleEl.textContent = isDenied ? 'Brak dostępu' : 'Finanse';
    }
    if (messageEl) {
        if (isSignin) {
            messageEl.textContent = usesEmailPasswordAuth()
                ? 'Zaloguj się adresem e-mail i hasłem.'
                : 'Zaloguj się kontem Google, aby korzystać z aplikacji.';
        } else if (isDenied) {
            messageEl.textContent = message || 'To konto nie ma uprawnień. Dostęp przyznaje administrator.';
        } else if (isChecking) {
            messageEl.textContent = 'Sprawdzanie sesji…';
        } else {
            messageEl.textContent = message || 'Zaloguj się, aby kontynuować.';
        }
    }
    if (checkingEl) checkingEl.classList.toggle('hidden', !isChecking);
    if (signInBtn) signInBtn.classList.toggle('hidden', isChecking || isDenied || usesEmailPasswordAuth());
    if (emailForm) emailForm.classList.toggle('hidden', isChecking || isDenied || !usesEmailPasswordAuth());
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

function configureAuthPlatformUi() {
    const emailInput = document.getElementById('auth-email');
    if (emailInput && !emailInput.value && ALLOWED_AUTH_EMAILS[0]) {
        emailInput.value = ALLOWED_AUTH_EMAILS[0];
    }
}

function forceCanonicalIndexUrl() {
    const href = window.location.href;
    if (href.includes('apiKey=') || href.includes('mode=signIn') || href.includes('oobCode=')) return;
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

async function signInWithEmailPassword(event) {
    if (event?.preventDefault) event.preventDefault();
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const submitBtn = document.getElementById('btn-email-signin');
    const email = normalizeAuthEmail(emailInput?.value);
    const password = passwordInput?.value || '';

    if (!email || !password) {
        setAuthUiMode('error', 'Podaj e-mail i hasło.');
        return;
    }
    if (!isEmailAllowed(email)) {
        setAuthUiMode('denied', `Konto ${email} nie ma dostępu.`);
        return;
    }

    setAuthUiMode('checking');
    if (submitBtn) submitBtn.disabled = true;
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
        console.error('signInWithEmailPassword', err);
        setAuthUiMode('error', formatAuthError(err));
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setAuthUiMode('checking');
    forceCanonicalIndexUrl();
    await unregisterServiceWorkerForAuth();

    try {
        await auth.signInWithPopup(provider);
    } catch (popupErr) {
        console.warn('signInWithPopup', popupErr);
        if (popupErr?.code === 'auth/popup-closed-by-user') {
            setAuthUiMode('signin');
            return;
        }
        if (popupErr?.code === 'auth/popup-blocked' || popupErr?.code === 'auth/cancelled-popup-request') {
            try {
                await auth.signInWithRedirect(provider);
                return;
            } catch (redirectErr) {
                console.error('signInWithRedirect', redirectErr);
                setAuthUiMode('error', formatAuthError(redirectErr));
                return;
            }
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
            setAuthUiMode('denied', `Zalogowano jako ${email || 'nieznany e-mail'}, ale to konto nie ma dostępu.`);
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
        registerServiceWorker();
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
    forceCanonicalIndexUrl();
    configureAuthPlatformUi();
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

    if (!usesEmailPasswordAuth()) {
        try {
            const redirectResult = await auth.getRedirectResult();
            if (redirectResult?.user) {
                await handleAuthenticatedUser(redirectResult.user);
            } else if (redirectResult?.credential && auth.currentUser) {
                await handleAuthenticatedUser(auth.currentUser);
            }
        } catch (err) {
            console.error('getRedirectResult', err);
            setAuthUiMode('error', formatAuthError(err));
        }
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
