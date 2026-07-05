const APP_LOCK_PIN_ENABLED_KEY = 'finanse_app_lock_pin_enabled';
const APP_LOCK_PIN_HASH_KEY = 'finanse_app_lock_pin_hash';
const APP_LOCK_PIN_SALT_KEY = 'finanse_app_lock_pin_salt';
const APP_LOCK_BIO_ENABLED_KEY = 'finanse_app_lock_bio_enabled';
const APP_LOCK_CREDENTIAL_ID_KEY = 'finanse_app_lock_credential_id';
const APP_LOCK_LAST_ACTIVITY_KEY = 'finanse_app_lock_last_activity';
const APP_LOCK_SESSION_KEY = 'finanse_app_lock_session';
const APP_LOCK_IDLE_MS = 5 * 60 * 1000;
const APP_LOCK_PIN_LENGTH = 4;
const APP_LOCK_QUICK_ADD_KEY = 'finanse_app_lock_quick_add';

let appLockOverlayVisible = false;
let appLockRestricted = false;
let appLockPinBuffer = '';
let appLockSetupBuffer = '';
let appLockSetupFirstPin = '';
let appLockSetupMode = 'create';
let appLockIdleTimer = null;

function appLockStorageKey(base) {
    const uid = typeof getFinanceStorageKey === 'function' ? getFinanceStorageKey() : null;
    return uid ? `${base}_${uid}` : base;
}

function readAppLockFlag(key) {
    try {
        return localStorage.getItem(appLockStorageKey(key)) === '1';
    } catch {
        return false;
    }
}

function writeAppLockFlag(key, enabled) {
    try {
        localStorage.setItem(appLockStorageKey(key), enabled ? '1' : '0');
    } catch (err) {
        console.warn('writeAppLockFlag', err);
    }
}

function isAppLockPinEnabled() {
    return readAppLockFlag(APP_LOCK_PIN_ENABLED_KEY);
}

function isAppLockBiometricEnabled() {
    return readAppLockFlag(APP_LOCK_BIO_ENABLED_KEY);
}

function isAppLockEnabled() {
    return isAppLockPinEnabled() || isAppLockBiometricEnabled();
}

function isAppLockQuickAddEnabled() {
    try {
        const raw = localStorage.getItem(appLockStorageKey(APP_LOCK_QUICK_ADD_KEY));
        if (raw === null) return true;
        return raw === '1';
    } catch {
        return true;
    }
}

function isAppLockRestricted() {
    return appLockRestricted;
}

function canAccessAppLockView(viewId) {
    if (!isAppLockRestricted()) return true;
    return viewId === 'add';
}

function guardAppLockSensitiveAction() {
    if (!isAppLockRestricted()) return true;
    requestAppLockUnlockPrompt();
    return false;
}

function requestAppLockUnlockPrompt() {
    showAppLockOverlay();
}

function hasStoredAppLockPin() {
    try {
        return !!localStorage.getItem(appLockStorageKey(APP_LOCK_PIN_HASH_KEY));
    } catch {
        return false;
    }
}

function getAppLockBiometricLabel() {
    if (/iPad|iPhone|iPod/i.test(navigator.userAgent || '')) return 'Face ID / Touch ID';
    return 'Biometria';
}

async function isAppLockBiometricAvailable() {
    if (!window.PublicKeyCredential || typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
        return false;
    }
    try {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

function bytesToBase64Url(bytes) {
    const bin = String.fromCharCode(...new Uint8Array(bytes));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const bin = atob(padded + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
}

async function hashAppLockPin(pin, salt) {
    const enc = new TextEncoder();
    const data = enc.encode(`${salt}:${pin}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function createAppLockSalt() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function storeAppLockPin(pin) {
    const salt = createAppLockSalt();
    const hash = await hashAppLockPin(pin, salt);
    localStorage.setItem(appLockStorageKey(APP_LOCK_PIN_SALT_KEY), salt);
    localStorage.setItem(appLockStorageKey(APP_LOCK_PIN_HASH_KEY), hash);
}

async function verifyAppLockPin(pin) {
    try {
        const salt = localStorage.getItem(appLockStorageKey(APP_LOCK_PIN_SALT_KEY));
        const expected = localStorage.getItem(appLockStorageKey(APP_LOCK_PIN_HASH_KEY));
        if (!salt || !expected) return false;
        const hash = await hashAppLockPin(pin, salt);
        return hash === expected;
    } catch {
        return false;
    }
}

function clearStoredAppLockPin() {
    localStorage.removeItem(appLockStorageKey(APP_LOCK_PIN_HASH_KEY));
    localStorage.removeItem(appLockStorageKey(APP_LOCK_PIN_SALT_KEY));
}

function getStoredAppLockCredentialId() {
    try {
        const raw = localStorage.getItem(appLockStorageKey(APP_LOCK_CREDENTIAL_ID_KEY));
        return raw ? base64UrlToBytes(raw) : null;
    } catch {
        return null;
    }
}

function storeAppLockCredentialId(credentialId) {
    localStorage.setItem(appLockStorageKey(APP_LOCK_CREDENTIAL_ID_KEY), bytesToBase64Url(credentialId));
}

function clearStoredAppLockCredential() {
    localStorage.removeItem(appLockStorageKey(APP_LOCK_CREDENTIAL_ID_KEY));
}

function getAppLockUserIdBytes() {
    const uid = typeof getFinanceStorageKey === 'function' ? getFinanceStorageKey() : 'local-user';
    const enc = new TextEncoder();
    return enc.encode(String(uid).slice(0, 64));
}

function getAppLockUserName() {
    if (typeof getUserAuthEmail === 'function' && typeof getCurrentAuthUser === 'function') {
        const email = getUserAuthEmail(getCurrentAuthUser());
        if (email) return email;
    }
    return 'Finanse';
}

async function registerAppLockBiometric() {
    if (!await isAppLockBiometricAvailable()) {
        throw new Error('Biometria nie jest dostępna na tym urządzeniu.');
    }
    const credential = await navigator.credentials.create({
        publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            rp: { name: 'Finanse', id: window.location.hostname },
            user: {
                id: getAppLockUserIdBytes(),
                name: getAppLockUserName(),
                displayName: 'Finanse'
            },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'required',
                residentKey: 'discouraged'
            },
            timeout: 60000,
            attestation: 'none'
        }
    });
    if (!credential?.rawId) throw new Error('Nie udało się zapisać biometrii.');
    storeAppLockCredentialId(credential.rawId);
}

async function unlockWithAppLockBiometric() {
    const credentialId = getStoredAppLockCredentialId();
    if (!credentialId) throw new Error('Brak zapisanej biometrii.');
    const assertion = await navigator.credentials.get({
        publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            allowCredentials: [{ type: 'public-key', id: credentialId }],
            userVerification: 'required',
            timeout: 60000
        }
    });
    if (!assertion) throw new Error('Odblokowanie biometrią nie powiodło się.');
    return true;
}

function touchAppLockActivity() {
    const now = Date.now();
    try {
        sessionStorage.setItem(APP_LOCK_LAST_ACTIVITY_KEY, String(now));
    } catch {
        /* ignore */
    }
}

function getAppLockLastActivityTs() {
    try {
        const raw = sessionStorage.getItem(APP_LOCK_LAST_ACTIVITY_KEY);
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : 0;
    } catch {
        return 0;
    }
}

function hasActiveAppLockSession() {
    try {
        return sessionStorage.getItem(APP_LOCK_SESSION_KEY) === '1';
    } catch {
        return false;
    }
}

function markAppLockSessionUnlocked() {
    try {
        sessionStorage.setItem(APP_LOCK_SESSION_KEY, '1');
    } catch {
        /* ignore */
    }
    touchAppLockActivity();
}

function clearAppLockSession() {
    try {
        sessionStorage.removeItem(APP_LOCK_SESSION_KEY);
    } catch {
        /* ignore */
    }
}

function shouldLockDueToIdle() {
    if (!hasActiveAppLockSession()) return true;
    const last = getAppLockLastActivityTs();
    if (!last) return true;
    return (Date.now() - last) >= APP_LOCK_IDLE_MS;
}

function setAppLockError(message) {
    const el = document.getElementById('app-lock-error');
    if (!el) return;
    if (!message) {
        el.textContent = '';
        el.classList.add('hidden');
        return;
    }
    el.textContent = message;
    el.classList.remove('hidden');
}

function setAppLockPinDots() {
    const dots = document.getElementById('app-lock-pin-dots');
    if (!dots) return;
    dots.querySelectorAll('.app-lock-pin-dot').forEach((dot, index) => {
        dot.classList.toggle('filled', index < appLockPinBuffer.length);
    });
}

function resetAppLockPinBuffer() {
    appLockPinBuffer = '';
    setAppLockPinDots();
    setAppLockError('');
}

function updateAppLockOverlayUi() {
    const bioBtn = document.getElementById('btn-app-lock-bio');
    const pinPad = document.getElementById('app-lock-pin-pad');
    const subtitle = document.getElementById('app-lock-subtitle');
    const showBio = isAppLockBiometricEnabled() && !!getStoredAppLockCredentialId();
    const showPin = isAppLockPinEnabled() && hasStoredAppLockPin();
    if (bioBtn) {
        bioBtn.classList.toggle('hidden', !showBio);
        bioBtn.textContent = `Odblokuj ${getAppLockBiometricLabel()}`;
    }
    if (pinPad) pinPad.classList.toggle('hidden', !showPin);
    if (subtitle) {
        if (showBio && showPin) {
            subtitle.textContent = `Użyj ${getAppLockBiometricLabel()} lub wpisz PIN.`;
        } else if (showBio) {
            subtitle.textContent = `Użyj ${getAppLockBiometricLabel()}.`;
        } else {
            subtitle.textContent = 'Wpisz PIN, aby kontynuować.';
        }
    }
    const backQuick = document.getElementById('btn-app-lock-back-quick');
    if (backQuick) {
        backQuick.classList.toggle('hidden', !appLockRestricted || !isAppLockQuickAddEnabled());
    }
}

function showAppLockOverlay() {
    const overlay = document.getElementById('app-lock-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    document.body.classList.add('app-lock-locked');
    appLockOverlayVisible = true;
    resetAppLockPinBuffer();
    updateAppLockOverlayUi();
    updateAppLockRestrictedUi();
}

function hideAppLockOverlay() {
    const overlay = document.getElementById('app-lock-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    document.body.classList.remove('app-lock-locked');
    appLockOverlayVisible = false;
    resetAppLockPinBuffer();
    setAppLockError('');
    updateAppLockRestrictedUi();
}

function updateAppLockRestrictedUi() {
    const banner = document.getElementById('app-lock-restricted-banner');
    if (banner) banner.classList.toggle('hidden', !appLockRestricted || appLockOverlayVisible);
    document.body.classList.toggle('app-lock-restricted', appLockRestricted && !appLockOverlayVisible);
    document.querySelectorAll('.nav-item[data-nav-view]').forEach((btn) => {
        const locked = appLockRestricted && btn.dataset.navView !== 'add';
        btn.classList.toggle('nav-item--app-lock-blocked', locked);
        btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
    });
    syncAppLockAddFormRestrictions();
}

function syncAppLockAddFormRestrictions() {
    const restricted = isAppLockRestricted();
    document.getElementById('btn-loan-payment')?.classList.toggle('hidden', restricted);
    document.getElementById('btn-card-payment')?.classList.toggle('hidden', restricted);
    if (restricted && typeof setFormMode === 'function' && typeof formState !== 'undefined') {
        const mode = formState.formMode;
        if (mode === 'loan' || mode === 'card') setFormMode('expense');
    }
}

function closeSensitivePanelsForAppLock() {
    if (typeof closeSkrybaPanel === 'function') closeSkrybaPanel();
    if (typeof closeSettings === 'function') closeSettings();
    if (typeof closeNotificationsPanel === 'function') closeNotificationsPanel();
}

function enterAppLockRestrictedMode() {
    closeSensitivePanelsForAppLock();
    appLockRestricted = true;
    clearAppLockSession();
    hideAppLockOverlay();
    document.body.classList.add('app-lock-restricted');
    updateAppLockRestrictedUi();
    const nav = document.querySelector('.nav-item[data-nav-view="add"]');
    if (typeof switchView === 'function') {
        switchView('add', 'Dodaj', nav || null, { bypassAppLock: true });
    }
}

function exitAppLockRestrictedMode() {
    appLockRestricted = false;
    document.body.classList.remove('app-lock-restricted');
    updateAppLockRestrictedUi();
    syncAppLockAddFormRestrictions();
}

function activateAppLockState(options = {}) {
    if (!isAppLockEnabled()) {
        exitAppLockRestrictedMode();
        hideAppLockOverlay();
        return false;
    }
    closeSensitivePanelsForAppLock();
    if (isAppLockQuickAddEnabled()) {
        enterAppLockRestrictedMode();
    } else {
        exitAppLockRestrictedMode();
        showAppLockOverlay();
    }
    return true;
}

function completeAppLockUnlock() {
    markAppLockSessionUnlocked();
    exitAppLockRestrictedMode();
    hideAppLockOverlay();
    scheduleAppLockIdleCheck();
}

async function submitAppLockPin() {
    if (appLockPinBuffer.length !== APP_LOCK_PIN_LENGTH) return;
    const ok = await verifyAppLockPin(appLockPinBuffer);
    if (!ok) {
        setAppLockError('Nieprawidłowy PIN.');
        resetAppLockPinBuffer();
        return;
    }
    completeAppLockUnlock();
}

function onAppLockPinDigit(digit) {
    if (!appLockOverlayVisible || appLockPinBuffer.length >= APP_LOCK_PIN_LENGTH) return;
    appLockPinBuffer += String(digit);
    setAppLockPinDots();
    if (appLockPinBuffer.length === APP_LOCK_PIN_LENGTH) {
        submitAppLockPin().catch((err) => {
            console.warn('submitAppLockPin', err);
            setAppLockError('Nie udało się sprawdzić PIN.');
            resetAppLockPinBuffer();
        });
    }
}

function onAppLockPinBackspace() {
    if (!appLockPinBuffer.length) return;
    appLockPinBuffer = appLockPinBuffer.slice(0, -1);
    setAppLockPinDots();
    setAppLockError('');
}

async function onAppLockBiometricClick() {
    setAppLockError('');
    try {
        await unlockWithAppLockBiometric();
        completeAppLockUnlock();
    } catch (err) {
        console.warn('onAppLockBiometricClick', err);
        setAppLockError(err?.message || 'Biometria nie powiodła się. Spróbuj PIN.');
    }
}

function maybeRequireAppLock(options = {}) {
    if (!isAppLockEnabled()) return false;
    const force = options.force === true;
    const startup = options.reason === 'startup';
    if (force || startup || shouldLockDueToIdle()) {
        activateAppLockState(options);
        return true;
    }
    touchAppLockActivity();
    scheduleAppLockIdleCheck();
    return false;
}

function lockAppNow() {
    if (!isAppLockEnabled()) {
        if (typeof showAppToast === 'function') {
            showAppToast('Włącz PIN lub biometrię w Ustawienia → Konto.', 'info');
        }
        return;
    }
    clearAppLockSession();
    activateAppLockState({ force: true });
}

function scheduleAppLockIdleCheck() {
    if (appLockIdleTimer) window.clearTimeout(appLockIdleTimer);
    if (!isAppLockEnabled() || appLockOverlayVisible || appLockRestricted) return;
    const remaining = APP_LOCK_IDLE_MS - (Date.now() - getAppLockLastActivityTs());
    const delay = Math.max(1000, remaining);
    appLockIdleTimer = window.setTimeout(() => {
        if (!isAppLockEnabled() || appLockOverlayVisible || appLockRestricted) return;
        if (document.visibilityState === 'visible' && shouldLockDueToIdle()) {
            activateAppLockState({ force: true });
        } else {
            scheduleAppLockIdleCheck();
        }
    }, delay);
}

function bindAppLockActivityListeners() {
    if (bindAppLockActivityListeners._done) return;
    bindAppLockActivityListeners._done = true;

    const onActivity = () => {
        if (!isAppLockEnabled() || appLockOverlayVisible || appLockRestricted) return;
        touchAppLockActivity();
        scheduleAppLockIdleCheck();
    };

    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach((eventName) => {
        document.addEventListener(eventName, onActivity, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
        if (!isAppLockEnabled()) return;
        if (document.visibilityState === 'hidden') return;
        if (shouldLockDueToIdle()) {
            activateAppLockState({ force: true });
            return;
        }
        if (!appLockRestricted) {
            touchAppLockActivity();
            scheduleAppLockIdleCheck();
        }
    });

    window.addEventListener('pagehide', () => {
        if (!isAppLockEnabled() || appLockOverlayVisible || appLockRestricted) return;
        touchAppLockActivity();
    });
}

function updateAppLockHeaderButton() {
    const btn = document.getElementById('btn-app-lock');
    if (!btn) return;
    btn.classList.toggle('hidden', !isAppLockEnabled());
}

function refreshAppLockSettingsUI() {
    const pinToggle = document.getElementById('app-lock-pin-toggle');
    const bioToggle = document.getElementById('app-lock-bio-toggle');
    const quickAddToggle = document.getElementById('app-lock-quick-add-toggle');
    const bioRow = document.getElementById('app-lock-bio-row');
    const changePinBtn = document.getElementById('btn-app-lock-change-pin');
    const bioHint = document.getElementById('app-lock-bio-hint');
    if (pinToggle) pinToggle.checked = isAppLockPinEnabled();
    if (bioToggle) bioToggle.checked = isAppLockBiometricEnabled();
    if (quickAddToggle) quickAddToggle.checked = isAppLockQuickAddEnabled();
    if (changePinBtn) changePinBtn.classList.toggle('hidden', !isAppLockPinEnabled());
    if (bioRow) bioRow.classList.toggle('hidden', false);
    if (bioHint) {
        bioHint.textContent = `Odblokowanie ${getAppLockBiometricLabel()} na tym urządzeniu.`;
    }
    isAppLockBiometricAvailable().then((available) => {
        if (!bioToggle || !bioRow) return;
        bioRow.classList.toggle('app-lock-bio-unavailable', !available);
        if (!available) bioToggle.checked = false;
        if (bioHint && !available) {
            bioHint.textContent = `${getAppLockBiometricLabel()} nie jest dostępne w tej przeglądarce.`;
        }
    }).catch(() => {});
    updateAppLockHeaderButton();
}

let appLockSetupResolver = null;

function openAppLockPinSetupModal(mode = 'create') {
    return new Promise((resolve) => {
        const modal = document.getElementById('app-lock-setup-overlay');
        if (!modal) {
            resolve(null);
            return;
        }
        appLockSetupBuffer = '';
        appLockSetupFirstPin = '';
        appLockSetupMode = mode;
        const title = document.getElementById('app-lock-setup-title');
        const subtitle = document.getElementById('app-lock-setup-subtitle');
        if (mode === 'verify') {
            if (title) title.textContent = 'Podaj PIN';
            if (subtitle) subtitle.textContent = 'Wpisz aktualny PIN, aby kontynuować.';
        } else {
            if (title) title.textContent = 'Ustaw PIN';
            if (subtitle) subtitle.textContent = `Wpisz ${APP_LOCK_PIN_LENGTH}-cyfrowy PIN.`;
        }
        modal.classList.remove('hidden');
        appLockSetupResolver = resolve;
        setAppLockSetupDots();
        setAppLockSetupError('');
    });
}

function closeAppLockPinSetupModal(result = null) {
    const modal = document.getElementById('app-lock-setup-overlay');
    if (modal) modal.classList.add('hidden');
    appLockSetupBuffer = '';
    appLockSetupFirstPin = '';
    appLockSetupMode = 'create';
    if (appLockSetupResolver) {
        appLockSetupResolver(result);
        appLockSetupResolver = null;
    }
}

function setAppLockSetupDots() {
    const dots = document.getElementById('app-lock-setup-dots');
    if (!dots) return;
    dots.querySelectorAll('.app-lock-pin-dot').forEach((dot, index) => {
        dot.classList.toggle('filled', index < appLockSetupBuffer.length);
    });
}

function setAppLockSetupError(message) {
    const el = document.getElementById('app-lock-setup-error');
    if (!el) return;
    if (!message) {
        el.textContent = '';
        el.classList.add('hidden');
        return;
    }
    el.textContent = message;
    el.classList.remove('hidden');
}

function onAppLockSetupDigit(digit) {
    if (appLockSetupBuffer.length >= APP_LOCK_PIN_LENGTH) return;
    appLockSetupBuffer += String(digit);
    setAppLockSetupDots();
    if (appLockSetupBuffer.length !== APP_LOCK_PIN_LENGTH) return;

    if (appLockSetupMode === 'verify') {
        closeAppLockPinSetupModal(appLockSetupBuffer);
        return;
    }

    if (!appLockSetupFirstPin) {
        appLockSetupFirstPin = appLockSetupBuffer;
        appLockSetupBuffer = '';
        const subtitle = document.getElementById('app-lock-setup-subtitle');
        const title = document.getElementById('app-lock-setup-title');
        if (title) title.textContent = 'Potwierdź PIN';
        if (subtitle) subtitle.textContent = 'Wpisz PIN ponownie.';
        setAppLockSetupDots();
        return;
    }

    if (appLockSetupFirstPin !== appLockSetupBuffer) {
        setAppLockSetupError('PIN-y się nie zgadzają. Spróbuj ponownie.');
        appLockSetupBuffer = '';
        appLockSetupFirstPin = '';
        const title = document.getElementById('app-lock-setup-title');
        const subtitle = document.getElementById('app-lock-setup-subtitle');
        if (title) title.textContent = 'Ustaw PIN';
        if (subtitle) subtitle.textContent = `Wpisz ${APP_LOCK_PIN_LENGTH}-cyfrowy PIN.`;
        setAppLockSetupDots();
        return;
    }
    closeAppLockPinSetupModal(appLockSetupBuffer);
}

function onAppLockSetupBackspace() {
    if (!appLockSetupBuffer.length) return;
    appLockSetupBuffer = appLockSetupBuffer.slice(0, -1);
    setAppLockSetupDots();
    setAppLockSetupError('');
}

function cancelAppLockPinSetup() {
    closeAppLockPinSetupModal(null);
}

async function promptForCurrentAppLockPin() {
    if (!hasStoredAppLockPin()) return true;
    const pin = await openAppLockPinSetupModal('verify');
    if (!pin) return false;
    return verifyAppLockPin(pin);
}

async function onAppLockPinToggle() {
    const toggle = document.getElementById('app-lock-pin-toggle');
    const wantEnabled = !!toggle?.checked;
    if (wantEnabled) {
        if (hasStoredAppLockPin()) {
            writeAppLockFlag(APP_LOCK_PIN_ENABLED_KEY, true);
            refreshAppLockSettingsUI();
            if (typeof showAppToast === 'function') showAppToast('PIN włączony.', 'success');
            return;
        }
        const pin = await openAppLockPinSetupModal('create');
        if (!pin) {
            if (toggle) toggle.checked = false;
            return;
        }
        await storeAppLockPin(pin);
        writeAppLockFlag(APP_LOCK_PIN_ENABLED_KEY, true);
        markAppLockSessionUnlocked();
        refreshAppLockSettingsUI();
        if (typeof showAppToast === 'function') showAppToast('PIN ustawiony.', 'success');
        return;
    }

    if (!await promptForCurrentAppLockPin()) {
        if (toggle) toggle.checked = true;
        if (typeof showAppToast === 'function') showAppToast('Nieprawidłowy PIN.', 'error');
        return;
    }
    writeAppLockFlag(APP_LOCK_PIN_ENABLED_KEY, false);
    if (!isAppLockBiometricEnabled()) {
        clearStoredAppLockPin();
        clearAppLockSession();
        exitAppLockRestrictedMode();
        hideAppLockOverlay();
    }
    refreshAppLockSettingsUI();
    if (typeof showAppToast === 'function') showAppToast('PIN wyłączony.', 'success');
}

async function onAppLockBiometricToggle() {
    const toggle = document.getElementById('app-lock-bio-toggle');
    const wantEnabled = !!toggle?.checked;
    if (wantEnabled) {
        const available = await isAppLockBiometricAvailable();
        if (!available) {
            if (toggle) toggle.checked = false;
            if (typeof showAppToast === 'function') {
                showAppToast(`${getAppLockBiometricLabel()} niedostępne na tym urządzeniu.`, 'error');
            }
            return;
        }
        try {
            await registerAppLockBiometric();
            writeAppLockFlag(APP_LOCK_BIO_ENABLED_KEY, true);
            markAppLockSessionUnlocked();
            refreshAppLockSettingsUI();
            if (typeof showAppToast === 'function') {
                showAppToast(`${getAppLockBiometricLabel()} włączone.`, 'success');
            }
        } catch (err) {
            console.warn('onAppLockBiometricToggle', err);
            if (toggle) toggle.checked = false;
            clearStoredAppLockCredential();
            writeAppLockFlag(APP_LOCK_BIO_ENABLED_KEY, false);
            if (typeof showAppToast === 'function') {
                showAppToast(err?.message || 'Nie udało się włączyć biometrii.', 'error');
            }
        }
        return;
    }

    writeAppLockFlag(APP_LOCK_BIO_ENABLED_KEY, false);
    clearStoredAppLockCredential();
    if (!isAppLockPinEnabled()) {
        clearAppLockSession();
        exitAppLockRestrictedMode();
        hideAppLockOverlay();
    }
    refreshAppLockSettingsUI();
    if (typeof showAppToast === 'function') showAppToast('Biometria wyłączona.', 'success');
}

async function onAppLockChangePinClick() {
    if (!isAppLockPinEnabled()) return;
    const currentOk = await promptForCurrentAppLockPin();
    if (!currentOk) {
        if (typeof showAppToast === 'function') showAppToast('Nieprawidłowy PIN.', 'error');
        return;
    }
    const pin = await openAppLockPinSetupModal('create');
    if (!pin) return;
    await storeAppLockPin(pin);
    markAppLockSessionUnlocked();
    if (typeof showAppToast === 'function') showAppToast('PIN zmieniony.', 'success');
}

function onAppLockQuickAddToggle() {
    const toggle = document.getElementById('app-lock-quick-add-toggle');
    const enabled = !!toggle?.checked;
    writeAppLockFlag(APP_LOCK_QUICK_ADD_KEY, enabled);
    if (typeof showAppToast === 'function') {
        showAppToast(
            enabled
                ? 'Szybki wpis przy blokadzie włączony.'
                : 'Przy blokadzie wymagane będzie pełne odblokowanie.',
            'success'
        );
    }
}

function initAppLockPinPads() {
    document.querySelectorAll('[data-app-lock-digit]').forEach((btn) => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            const digit = btn.getAttribute('data-app-lock-digit');
            const target = btn.getAttribute('data-app-lock-target') || 'unlock';
            if (target === 'setup') onAppLockSetupDigit(digit);
            else onAppLockPinDigit(digit);
        });
    });
    document.querySelectorAll('[data-app-lock-action]').forEach((btn) => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-app-lock-action');
            const target = btn.getAttribute('data-app-lock-target') || 'unlock';
            if (action === 'backspace') {
                if (target === 'setup') onAppLockSetupBackspace();
                else onAppLockPinBackspace();
            } else if (action === 'cancel-setup') {
                cancelAppLockPinSetup();
            }
        });
    });
    const bioBtn = document.getElementById('btn-app-lock-bio');
    if (bioBtn && !bioBtn.dataset.bound) {
        bioBtn.dataset.bound = '1';
        bioBtn.addEventListener('click', () => {
            onAppLockBiometricClick().catch((err) => console.warn(err));
        });
    }
    const headerBtn = document.getElementById('btn-app-lock');
    if (headerBtn && !headerBtn.dataset.bound) {
        headerBtn.dataset.bound = '1';
        headerBtn.addEventListener('click', () => lockAppNow());
    }
    const unlockBtn = document.getElementById('btn-app-lock-unlock');
    if (unlockBtn && !unlockBtn.dataset.bound) {
        unlockBtn.dataset.bound = '1';
        unlockBtn.addEventListener('click', () => requestAppLockUnlockPrompt());
    }
    const backQuickBtn = document.getElementById('btn-app-lock-back-quick');
    if (backQuickBtn && !backQuickBtn.dataset.bound) {
        backQuickBtn.dataset.bound = '1';
        backQuickBtn.addEventListener('click', () => hideAppLockOverlay());
    }
}

function initAppLock() {
    initAppLockPinPads();
    bindAppLockActivityListeners();
    refreshAppLockSettingsUI();
}
